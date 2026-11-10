#!/usr/bin/env python3
"""Exercise the foundation validator with synthetic, isolated checkout fixtures."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

checker = Path(__file__).with_name("check-foundations.py")
with tempfile.TemporaryDirectory(prefix="agent-foundation-tests-") as temporary:
    root = Path(temporary) / "fixture"
    root.mkdir()
    home = Path(temporary) / "empty-home"
    home.mkdir()
    (root / ".agents").mkdir()
    shutil.copyfile(checker, root / ".agents/check-foundations.py")
    skill = root / ".agents/skills/secure-api-delivery"
    skill.mkdir(parents=True)
    names = ["SKILL.md", "a.md", "b.md", "c.md", "icon.svg", "agent.yaml"]
    for name in names:
        (skill / name).write_text("fixture\n")
    config = {"knowledge": "knowledge.md", "required_skill_files": names}
    (root / ".agents/foundations.json").write_text(json.dumps(config))
    agents = "[knowledge](knowledge.md)\n[skill](.agents/skills/secure-api-delivery/SKILL.md)\n"
    (root / "AGENTS.md").write_text(agents)
    (root / "README.md").write_text("[instructions](AGENTS.md)\n")
    (root / "knowledge.md").write_text("# Synthetic knowledge\n")
    def check(label, valid):
        result = subprocess.run([sys.executable, ".agents/check-foundations.py"],
            cwd=root, env={**os.environ, "HOME": str(home)}, capture_output=True, text=True)
        assert (result.returncode == 0) == valid, (label, result.stdout, result.stderr)
        print("PASS:", label)
    check("valid checkout with empty HOME and no Git metadata", True)
    (skill / "a.md").unlink()
    check("missing skill resource rejected", False)
    (skill / "a.md").write_text("fixture\n")
    (root / "knowledge.md").write_text("[broken](missing.md)\n")
    check("broken reference rejected", False)
    (root / "knowledge.md").write_text("[escape](../empty-home)\n")
    check("escaping reference rejected", False)
    (root / "knowledge.md").write_text("# Synthetic knowledge\n")
    (skill / "a.md").unlink()
    (skill / "a.md").symlink_to(home)
    check("symlink resource rejected", False)
    (skill / "a.md").unlink()
    (skill / "a.md").write_text("fixture\n")
    (root / "AGENTS.md").write_text("# Missing pointers\n")
    check("missing agent discovery pointers rejected", False)
    (root / "AGENTS.md").write_text(agents)
    check("restored checkout", True)
