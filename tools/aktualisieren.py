"""Wingetarium: liest den offiziellen winget-Quellindex und schreibt data/*.json.

Laeuft taeglich als GitHub Action (.github/workflows/aktualisieren.yml),
geht aber genauso von Hand:  python tools/aktualisieren.py
Optional:  python tools/aktualisieren.py --msix pfad/zu/source.msix  (ohne Download)

Schreibt:
  data/stand.json   Zahlen, Schlagworte, Versionen der Auswahl, Neu im Repo, Verlauf
  data/index.json   alle Pakete (ID, Name, Version, Kurzname, Kurzbeschreibung, Schlagworte) fuer die Suche
  data/text/<x>.json  Herausgeber, Lizenz, Webseite, Beschreibung je Paket, nach erstem Zeichen der ID geteilt

Die Beschreibungen stehen nicht im Index, sondern in den Manifesten auf dem CDN. Geholt wird nur,
was sich seit gestern geaendert hat (Kennung: Hash des Manifests). Braucht PyYAML.
"""
import concurrent.futures as cf
import datetime as dt
import io
import json
import re
import sqlite3
import sys
import tempfile
import urllib.parse
import urllib.request
import zipfile
from collections import Counter
from pathlib import Path

import yaml

QUELLE = "https://cdn.winget.microsoft.com/cache/source.msix"
CDN = "https://cdn.winget.microsoft.com/cache/"
TEXT = "text"          # Unterordner von data/ fuer die Beschreibungen
BESCHR_MAX = 1500      # laengere Beschreibungen werden gekuerzt
TAGS_MAX = 10          # so viele Schlagworte je Paket in index.json
WURZEL = Path(__file__).resolve().parent.parent
DATEN = WURZEL / "data"
NEU_TAGE = 30          # so viele Tage bleibt "Neu im Repo" sichtbar
NEU_MAX_JE_TAG = 400   # Schutz, falls der Index einmal komplett neu aufgebaut wird
# Schlagworte der 460 Firefox-Sprachpakete, die sonst die Verteilung verzerren
TAG_AUSNAHMEN = {"gecko", "quantum", "spidermonkey"}


def versions_schluessel(v: str):
    """Sortiert Versionen etwa so, wie winget es tut: Teil fuer Teil, Zahlen als Zahlen."""
    v = v.strip().lstrip("vV")
    teile = []
    for t in re.split(r"[.]", v):
        m = re.match(r"(\d*)(.*)", t)
        zahl = int(m.group(1)) if m.group(1) else 0
        rest = m.group(2)
        # leerer Rest (Endversion) steht vor Vorab-Kennungen wie -beta
        teile.append((zahl, rest == "", rest))
    while teile and teile[-1] == (0, True, ""):
        teile.pop()
    return teile


def laden(msix: Path | None) -> bytes:
    if msix:
        return msix.read_bytes()
    req = urllib.request.Request(QUELLE, headers={"User-Agent": "wingetarium-bot"})
    with urllib.request.urlopen(req, timeout=180) as r:
        return r.read()


def main():
    args = sys.argv[1:]
    msix = Path(args[args.index("--msix") + 1]) if "--msix" in args else None
    roh = laden(msix)
    with tempfile.TemporaryDirectory() as tmp:
        db = Path(tmp) / "index.db"
        with zipfile.ZipFile(io.BytesIO(roh)) as z:
            db.write_bytes(z.read("Public/index.db"))
        con = sqlite3.connect(db)
        auswerten(con)
        con.close()


def auswerten(con):
    meta = dict(con.execute("select name, value from metadata"))
    stand = dt.datetime.fromtimestamp(int(meta["lastwritetime"]), dt.timezone.utc)
    heute = dt.datetime.now(dt.timezone.utc).date().isoformat()

    zeilen = con.execute(
        """select m.rowid, i.id, n.name, mo.moniker, v.version, m.pathpart, m.hash
           from manifest m
           join ids i on i.rowid = m.id
           join names n on n.rowid = m.name
           join monikers mo on mo.rowid = m.moniker
           join versions v on v.rowid = m.version"""
    ).fetchall()

    neueste = {}  # id -> (schluessel, name, moniker, version, manifest, pfadteil, hash)
    for rowid, pid, name, mon, ver, pfad, hsh in zeilen:
        k = versions_schluessel(ver)
        alt = neueste.get(pid)
        if alt is None or k > alt[0]:
            neueste[pid] = (k, name, mon, ver, rowid, pfad, (hsh or b"").hex()[:12])

    manifest_zu_id = {rowid: pid for rowid, pid, *_ in zeilen}
    neuestes_manifest = {w[4]: pid for pid, w in neueste.items()}

    # Schlagworte: je Paket einmal zaehlen (ueber alle Versionen)
    tag_je_paket = {}
    tags_neueste = {}  # id -> Schlagworte der neuesten Version
    for man, tag in con.execute(
        "select tm.manifest, t.tag from tags_map tm join tags t on t.rowid = tm.tag"
    ):
        tag_je_paket.setdefault(tag.lower(), set()).add(manifest_zu_id.get(man))
        if man in neuestes_manifest:
            liste = tags_neueste.setdefault(neuestes_manifest[man], [])
            if tag.lower() not in liste:
                liste.append(tag.lower())
    tags = Counter({t: len(p - {None}) for t, p in tag_je_paket.items()})
    oben = [
        [t, n] for t, n in tags.most_common(200)
        if t not in TAG_AUSNAHMEN and t.isascii()
    ][:20]

    herausgeber = Counter(pid.split(".", 1)[0] for pid in neueste)

    # Auswahl (handverlesen) mit heutigen Versionen
    auswahl = json.loads((DATEN / "auswahl.json").read_text(encoding="utf8"))
    versionen_auswahl, fehlt = {}, []
    for eintrag in auswahl:
        w = neueste.get(eintrag["id"])
        if w:
            versionen_auswahl[eintrag["id"]] = {"v": w[3], "n": w[1]}
        else:
            fehlt.append(eintrag["id"])

    namen_klein = {pid: w[1].lower() for pid, w in neueste.items()}
    grenzen = {
        "treiber": sum(1 for n in namen_klein.values() if "driver" in n),
        "schriften": sum(
            1 for pid, n in namen_klein.items()
            if "font" in n or "font" in pid.lower()
        ),
        "firefoxSprachen": sum(1 for pid in neueste if pid.startswith("Mozilla.Firefox.")),
        "anzeigetreiber": sorted(
            pid for pid, n in namen_klein.items()
            if pid.lower().startswith(("nvidia.", "amd.")) and "display driver" in n
        ),
        "signal": any(pid.startswith("OpenWhisperSystems.Signal") for pid in neueste),
        "musicbee": any("musicbee" in pid.lower() for pid in neueste),
    }

    # Gestern vs. heute: was ist neu?
    alt_index = DATEN / "index.json"
    alte_ids = set()
    if alt_index.exists():
        alte_ids = {z[0] for z in json.loads(alt_index.read_text(encoding="utf8"))["p"]}
    alt_stand = {}
    if (DATEN / "stand.json").exists():
        alt_stand = json.loads((DATEN / "stand.json").read_text(encoding="utf8"))
    neu_liste = [t for t in alt_stand.get("neu", []) if t["d"] != heute]
    if alte_ids:
        dazu = sorted(set(neueste) - alte_ids, key=str.lower)
        if dazu and len(dazu) <= NEU_MAX_JE_TAG:
            neu_liste.insert(0, {"d": heute, "p": [[p, neueste[p][1], neueste[p][3]] for p in dazu]})
    grenze = (dt.date.fromisoformat(heute) - dt.timedelta(days=NEU_TAGE)).isoformat()
    neu_liste = [t for t in neu_liste if t["d"] > grenze]

    verlauf = [z for z in alt_stand.get("verlauf", []) if z[0] != heute]
    verlauf.append([heute, len(neueste), len(zeilen)])
    verlauf.sort()

    stand_json = {
        "stand": stand.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "abgerufen": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "pakete": len(neueste),
        "manifeste": len(zeilen),
        "versionen": con.execute("select count(*) from versions").fetchone()[0],
        "kurznamen": con.execute("select count(*) from monikers where moniker <> ''").fetchone()[0],
        "herausgeber": herausgeber.most_common(5),
        "tags": oben,
        "auswahl": versionen_auswahl,
        "fehlt": fehlt,
        "grenzen": grenzen,
        "neu": neu_liste,
        "verlauf": verlauf,
    }
    texte = beschreibungen(con, neueste)
    index_json = {
        "stand": stand_json["stand"],
        "p": sorted(
            ([pid, w[1], w[3], w[2], texte.get(pid, [""] * 2)[1],
              " ".join(sorted(tags_neueste.get(pid, []), key=lambda t: -tags[t])[:TAGS_MAX])]
             for pid, w in neueste.items()),
            key=lambda z: z[0].lower(),
        ),
    }
    schreiben(DATEN / "stand.json", stand_json)
    schreiben(DATEN / "index.json", index_json, kompakt=True)
    texte_schreiben(texte)
    print(f"Stand {stand_json['stand']}: {len(neueste)} Pakete, "
          f"{len(zeilen)} Manifeste, neu heute: "
          f"{len(neu_liste[0]['p']) if neu_liste and neu_liste[0]['d'] == heute else 0}, "
          f"fehlt in Auswahl: {fehlt or 'nichts'}")


def teil(pid: str) -> str:
    """Name der Teildatei unter data/text/ fuer eine Paket-ID."""
    c = pid[:1].lower()
    return c if c.isascii() and c.isalnum() else "_"


def beschreibungen(con, neueste):
    """id -> [hash, kurz, herausgeber, lizenz, webseite, beschreibung]; holt nur Geaendertes vom CDN."""
    alt = {}
    for f in (DATEN / TEXT).glob("*.json"):
        alt.update(json.loads(f.read_text(encoding="utf8")))
    teile = {r: (p, t) for r, p, t in con.execute("select rowid, parent, pathpart from pathparts")}

    def pfad(r):
        out = []
        while r:
            r, t = teile[r]
            out.append(t)
        return "/".join(reversed(out))

    texte, holen = {}, []
    for pid, w in neueste.items():
        a = alt.get(pid)
        if a and a[0] == w[6]:
            texte[pid] = a
        else:
            holen.append(pid)

    def eins(pid):
        url = CDN + urllib.parse.quote(pfad(neueste[pid][5]))
        req = urllib.request.Request(url, headers={"User-Agent": "wingetarium-bot"})
        for _ in range(3):
            try:
                with urllib.request.urlopen(req, timeout=30) as r:
                    return pid, yaml.load(r.read(), Loader=getattr(yaml, "CSafeLoader", yaml.SafeLoader))
            except Exception:
                pass
        return pid, None

    def s(v):
        return " ".join(str(v).split()) if v else ""

    fehler = 0
    with cf.ThreadPoolExecutor(24) as ex:
        for pid, m in ex.map(eins, holen):
            if not isinstance(m, dict):
                fehler += 1
                if pid in alt:
                    texte[pid] = alt[pid]  # alter Text ist besser als keiner; Hash bleibt alt, morgen neuer Versuch
                continue
            lang = (m.get("Description") or "").strip()
            if len(lang) > BESCHR_MAX:
                lang = lang[:BESCHR_MAX].rsplit(" ", 1)[0] + " …"
            texte[pid] = [neueste[pid][6], s(m.get("ShortDescription")), s(m.get("Publisher")),
                          s(m.get("License")), s(m.get("PackageUrl") or m.get("PublisherUrl")), lang]
    print(f"Beschreibungen: {len(holen) - fehler} neu geholt, {fehler} Fehler, {len(texte)} gesamt")
    return texte


def texte_schreiben(texte):
    ordner = DATEN / TEXT
    ordner.mkdir(exist_ok=True)
    gruppen = {}
    for pid in sorted(texte, key=str.lower):
        gruppen.setdefault(teil(pid), {})[pid] = texte[pid]
    for f in ordner.glob("*.json"):
        if f.stem not in gruppen:
            f.unlink()
    for name, inhalt in gruppen.items():
        d = lambda x: json.dumps(x, ensure_ascii=False, separators=(",", ":"))
        text = "{\n" + ",\n".join(d(k) + ":" + d(v) for k, v in inhalt.items()) + "\n}"
        (ordner / f"{name}.json").write_text(text + "\n", encoding="utf8", newline="\n")


def schreiben(pfad: Path, daten, kompakt=False):
    if kompakt:
        # eine Zeile je Paket, damit Git-Diffs lesbar bleiben (Texte koennen selbst '],["' enthalten)
        d = lambda x: json.dumps(x, ensure_ascii=False, separators=(",", ":"))
        text = '{"stand":' + d(daten["stand"]) + ',"p":[' + ",\n".join(d(z) for z in daten["p"]) + "]}"
    else:
        text = json.dumps(daten, ensure_ascii=False, indent=1)
    pfad.write_text(text + "\n", encoding="utf8", newline="\n")


if __name__ == "__main__":
    main()
