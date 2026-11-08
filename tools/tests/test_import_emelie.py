"""Tester för tools/import_emelie.py mot fixturen (pdftotext -layout av vinter-PDF:en).

Körs från repots rot:  python3 -m unittest
"""

import json
import os
import shutil
import sys
import tempfile
import unittest
from datetime import date

HERE = os.path.dirname(os.path.abspath(__file__))
TOOLS = os.path.normpath(os.path.join(HERE, ".."))
ROOT = os.path.normpath(os.path.join(TOOLS, ".."))
sys.path.insert(0, TOOLS)

import import_emelie as imp  # noqa: E402
import validate  # noqa: E402

FIXTURE = os.path.join(HERE, "fixtures", "emelie-vinter-2026.txt")
SOURCE = "Tidtabell-Emelie-A4-VINTER-2026.pdf"


def add(t, minutes):
    h, m = map(int, t.split(":"))
    n = h * 60 + m + minutes
    return f"{n // 60:02d}:{n % 60:02d}"


def expected_to_city(firsts, odd_first="10:14"):
    """Barnäng-tider -> alla bryggor. 10:14-turen avviker i Masthamnen/Djurgården."""
    offs = {"Barnängsbryggan": 0, "Lumabryggan": 6, "Henriksdalsbryggan": 8,
            "Masthamnen": 14, "Djurgården": 24, "Nybroplan": 34}
    out = {s: [add(t, o) for t in firsts] for s, o in offs.items()}
    i = firsts.index(odd_first)
    out["Masthamnen"][i] = "10:32"
    out["Djurgården"][i] = "10:40"
    return out


def expected_from_city(firsts):
    offs = {"Nybroplan": 0, "Djurgården": 8, "Masthamnen": 16,
            "Barnängsbryggan": 24, "Lumabryggan": 28, "Henriksdalsbryggan": 32}
    return {s: [add(t, o) for t in firsts] for s, o in offs.items()}


class ParseTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with open(FIXTURE, encoding="utf-8") as f:
            cls.text = f.read()
        with open(os.path.join(ROOT, "data", imp.CONFIG_NAME), encoding="utf-8") as f:
            cls.stops = json.load(f)["service_configuration"]["stop_sequence"]
        cls.warnings = []
        cls.tables, cls.sect = imp.parse_tables(cls.text, cls.stops, cls.warnings)

    def times(self, day, direction):
        return {s: [t for t, _ in rows] for s, rows in self.tables[day][direction].items()}

    def stars(self, day, direction):
        return {s: [t for t, star in rows if star] for s, rows in self.tables[day][direction].items()
                if any(star for _, star in rows)}

    def test_title_and_period(self):
        self.assertEqual(imp.parse_title(self.text), "VINTER 2026/2027")
        self.assertEqual(imp.parse_period(self.text), (date(2026, 11, 9), date(2027, 3, 29)))
        self.assertEqual(imp.title_to_slug("VINTER 2026/2027"), "vinter-2026-2027")
        self.assertEqual(imp.title_to_season_name("VINTER 2026/2027"), "Winter 2026-2027")
        self.assertEqual(set(self.sect.values()), {(date(2026, 11, 9), date(2027, 3, 29))})

    def test_no_parse_warnings(self):
        self.assertEqual(self.warnings, [])

    def test_weekday(self):
        to = ["07:14", "08:14", "09:14", "10:14", "11:14", "14:14", "15:14", "16:14", "17:14"]
        fr = ["07:50", "08:50", "09:50", "10:50", "11:50", "14:50", "15:50", "16:50", "17:50"]
        self.assertEqual(self.times("weekday", "to_city"), expected_to_city(to))
        self.assertEqual(self.times("weekday", "from_city"), expected_from_city(fr))
        self.assertEqual(self.stars("weekday", "from_city"), {
            "Barnängsbryggan": ["12:14", "18:14"],
            "Lumabryggan": ["12:18", "18:18"],
            "Henriksdalsbryggan": ["12:22", "18:22"]})
        self.assertEqual(self.stars("weekday", "to_city"), {})

    def test_saturday(self):
        to = ["09:14", "10:14", "11:14", "14:14", "15:14", "16:14", "17:14"]
        fr = ["09:50", "10:50", "11:50", "14:50", "15:50", "16:50", "17:50"]
        self.assertEqual(self.times("saturday", "to_city"), expected_to_city(to))
        self.assertEqual(self.times("saturday", "from_city"), expected_from_city(fr))
        self.assertEqual(self.stars("saturday", "from_city"), {
            "Barnängsbryggan": ["12:14", "18:14"],
            "Lumabryggan": ["12:18", "18:18"],
            "Henriksdalsbryggan": ["12:22", "18:22"]})

    def test_sunday(self):
        to = ["09:14", "10:14", "11:14", "14:14", "15:14", "16:14"]
        fr = ["09:50", "10:50", "11:50", "14:50", "15:50", "16:50"]
        self.assertEqual(self.times("sunday", "to_city"), expected_to_city(to))
        self.assertEqual(self.times("sunday", "from_city"), expected_from_city(fr))
        # PDF:en: avstigningsstjärna på sista turens Hammarby-tider (17:xx), inte 18:xx
        self.assertEqual(self.stars("sunday", "from_city"), {
            "Barnängsbryggan": ["12:14", "17:14"],
            "Lumabryggan": ["12:18", "17:18"],
            "Henriksdalsbryggan": ["12:22", "17:22"]})

    def test_anomaly_detected_not_corrected(self):
        an = imp.anomalies(self.tables["weekday"], self.stops)
        modal, odd = an["to_city"]
        self.assertEqual(modal["Masthamnen"], 14)
        self.assertEqual(len(odd), 1)
        self.assertEqual(odd[0][0], "10:14")
        self.assertEqual(odd[0][1], {"Masthamnen": "10:32", "Djurgården": "10:40"})
        self.assertEqual(an["from_city"][1], [])

    def test_notes(self):
        warnings, errors, infos = [], [], []
        nt, wk = imp.parse_notes(self.text, date(2026, 11, 9), date(2027, 3, 29), warnings, errors, infos)
        self.assertEqual(errors, [])
        self.assertEqual(warnings, [])
        self.assertEqual([d.isoformat() for d in nt], [
            "2026-12-24", "2026-12-25", "2026-12-26", "2026-12-27", "2026-12-31", "2027-01-01"])
        # 27 och 28 mars är lör/sön och har egna helgtabeller
        self.assertEqual([d.isoformat() for d in wk], ["2027-01-06", "2027-03-25", "2027-03-26", "2027-03-29"])
        self.assertEqual(len(infos), 2)

    def test_note_outside_period_is_error(self):
        errors = []
        imp.expand_dates("1 juni", date(2026, 11, 9), date(2027, 3, 29), errors, "Test")
        self.assertTrue(errors)

    def test_unparsable_note_is_error(self):
        errors = []
        imp.expand_dates("runt jul", date(2026, 11, 9), date(2027, 3, 29), errors, "Test")
        self.assertTrue(errors)

    def test_unknown_notice_warns(self):
        w = []
        imp.parse_tables("Måndag - Fredag  9 nov 2026 - 29 mars 2027\nOBS! Extra tur på långfredag\n", self.stops, w)
        self.assertTrue(any("oklassad notis" in x for x in w))


class WriteTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix="emelie-test-")
        self.data = os.path.join(self.tmp, "data")
        shutil.copytree(os.path.join(ROOT, "data"), self.data)
        # ta bort vintersäsongen om den redan är importerad, så testet börjar från före-läget
        for fn in os.listdir(self.data):
            if fn.startswith("ressel-city-vinter-2026-2027-"):
                os.unlink(os.path.join(self.data, fn))
        p = os.path.join(self.data, imp.CONFIG_NAME)
        with open(p, encoding="utf-8") as f:
            cfg = json.load(f)
        cfg["season_mapping"] = [s for s in cfg["season_mapping"] if s["period"]["start"] != "2026-11-09"]
        cfg["_metadata"]["data_sources"] = [d for d in cfg["_metadata"]["data_sources"] if SOURCE not in d]
        cfg["_metadata"]["version"] = "13.4.0"
        with open(p, "w", encoding="utf-8") as f:
            json.dump(cfg, f, ensure_ascii=False, indent=2)
        with open(FIXTURE, encoding="utf-8") as f:
            self.text = f.read()

    def tearDown(self):
        shutil.rmtree(self.tmp)

    def run_import(self, write):
        return imp.run(self.text, SOURCE, "https://example.invalid/" + SOURCE, self.data, write, today="2026-11-08")

    def snapshot(self):
        snap = {}
        for fn in sorted(os.listdir(self.data)):
            with open(os.path.join(self.data, fn), encoding="utf-8") as f:
                snap[fn] = f.read()
        return snap

    def test_dry_run_writes_nothing(self):
        before = self.snapshot()
        out, code = self.run_import(False)
        self.assertEqual(code, 0)
        self.assertIn("Inget skrivet", out)
        self.assertEqual(before, self.snapshot())

    def test_write_and_idempotent(self):
        out, code = self.run_import(True)
        self.assertEqual(code, 0, out)
        with open(os.path.join(self.data, imp.CONFIG_NAME), encoding="utf-8") as f:
            cfg = json.load(f)
        self.assertEqual(cfg["_metadata"]["version"], "13.5.0")
        self.assertEqual(cfg["_metadata"]["last_updated"], "2026-11-08")
        season = [s for s in cfg["season_mapping"] if s["name"] == "Winter 2026-2027"]
        self.assertEqual(len(season), 1)
        season = season[0]
        self.assertEqual(season["period"], {"start": "2026-11-09", "end": "2027-03-29"})
        self.assertEqual(season["files"], {d: f"ressel-city-vinter-2026-2027-{d}.json"
                                           for d in ("weekday", "saturday", "sunday")})
        self.assertEqual(season["holiday_rules"]["weekend_schedule"],
                         ["2027-01-06", "2027-03-25", "2027-03-26", "2027-03-29"])
        self.assertIn("source_pdf", season)
        # innehållet i en fil
        with open(os.path.join(self.data, season["files"]["sunday"]), encoding="utf-8") as f:
            sun = json.load(f)
        self.assertEqual(sun["metadata"]["day_type"], "sunday")
        self.assertEqual(sun["to_city"]["operating_hours"], {"start": "09:14", "end": "16:48"})
        self.assertEqual(sun["from_city"]["departures"]["Nybroplan"][-1], "16:50")
        self.assertEqual(sun["disembark_only"]["from_city"]["Barnängsbryggan"], ["12:14", "17:14"])
        # city-data klarar validatorn (sjo-fel som fanns innan räknas inte hit)
        rep = validate.validate(self.data)
        self.assertEqual([e for e in rep.errors if e.startswith("ressel-city-")], [])
        # andra körningen ändrar ingenting
        first = self.snapshot()
        out2, code2 = self.run_import(True)
        self.assertEqual(code2, 0, out2)
        self.assertEqual(first, self.snapshot())

    def test_identical_file_is_reused(self):
        # kopiera söndagsfilen under ett annat namn med annan metadata -> ska återanvändas
        self.run_import(True)
        sun = os.path.join(self.data, "ressel-city-vinter-2026-2027-sunday.json")
        os.rename(sun, os.path.join(self.data, "ressel-city-annan-sunday.json"))
        p = os.path.join(self.data, imp.CONFIG_NAME)
        with open(p, encoding="utf-8") as f:
            cfg = json.load(f)
        cfg["season_mapping"] = [s for s in cfg["season_mapping"] if s["period"]["start"] != "2026-11-09"]
        with open(p, "w", encoding="utf-8") as f:
            json.dump(cfg, f, ensure_ascii=False, indent=2)
        for d in ("weekday", "saturday"):
            os.unlink(os.path.join(self.data, f"ressel-city-vinter-2026-2027-{d}.json"))
        out, code = self.run_import(True)
        self.assertEqual(code, 0, out)
        self.assertFalse(os.path.exists(sun))
        with open(p, encoding="utf-8") as f:
            season = [s for s in json.load(f)["season_mapping"] if s["period"]["start"] == "2026-11-09"][0]
        self.assertEqual(season["files"]["sunday"], "ressel-city-annan-sunday.json")


if __name__ == "__main__":
    unittest.main()
