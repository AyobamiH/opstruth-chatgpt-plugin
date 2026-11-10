#!/usr/bin/env python3
"""Offline checkout-only foundation validation; not an application security gate."""
import json
import pathlib
import re
import sys

root = pathlib.Path(__file__).resolve().parents[1]
config = json.loads((root / ".agents/foundations.json").read_text())
skill = root / ".agents/skills/secure-api-delivery"
required = ["AGENTS.md", "README.md", config["knowledge"]]
required += [str((skill / name).relative_to(root)) for name in config["required_skill_files"]]
errors = []
for name in required:
    path = root / name
    if not path.is_file() or path.is_symlink():
        errors.append(f"Missing regular repository file: {name}")
for name in required:
    path = root / name
    if not path.is_file() or path.suffix != ".md":
        continue
    for target in re.findall(r"\[[^\]]*\]\(([^\s)]+)(?:\s+[^)]*)?\)", path.read_text()):
        if re.match(r"^[a-zA-Z][a-zA-Z0-9+.-]*:", target) or target.startswith("#"):
            continue
        target = target.split("#", 1)[0]
        resolved = (path.parent / target).resolve()
        if not resolved.is_relative_to(root) or not resolved.exists():
            errors.append(f"Unresolved checkout link in {name}: {target}")
agents = (root / "AGENTS.md").read_text()
for target in [config["knowledge"], ".agents/skills/secure-api-delivery/SKILL.md"]:
    if f"]({target})" not in agents:
        errors.append(f"AGENTS.md must link {target}")
if "](AGENTS.md)" not in (root / "README.md").read_text():
    errors.append("README.md must link AGENTS.md")
for file in skill.rglob("*"):
    if file.is_file() and file.suffix in {".md", ".yaml", ".svg"}:
        if "/home/" in file.read_text() or "~/" in file.read_text():
            errors.append(f"Machine-local skill reference: {file.relative_to(root)}")
if len(config["required_skill_files"]) != 6:
    errors.append("Expected complete six-file skill")
if errors:
    print("\n".join(errors), file=sys.stderr)
    raise SystemExit(1)
print("PASS: repository-owned skill, knowledge and relative links resolve without HOME or Git metadata")
