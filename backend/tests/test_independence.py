import ast
from pathlib import Path
def test_verifier_stdlib_only():
    root=Path(__file__).parents[1]/"src/chokepoint_verifier"
    for path in root.glob("*.py"):
        tree=ast.parse(path.read_text())
        for node in ast.walk(tree):
            if isinstance(node,ast.Import):
                assert all(n.name.split('.')[0] not in {"chokepoint","fastapi","pydantic"} for n in node.names)
            if isinstance(node,ast.ImportFrom): assert (node.module or "").split('.')[0] not in {"chokepoint","fastapi","pydantic"}

def test_core_does_not_import_verifier():
    root=Path(__file__).parents[1]/"src/chokepoint"
    for path in root.rglob("*.py"):
        if path.parent.name == "api" or path.name == "cli.py":
            continue
        tree=ast.parse(path.read_text())
        for node in ast.walk(tree):
            if isinstance(node,ast.Import): assert all(n.name.split('.')[0] != "chokepoint_verifier" for n in node.names)
            if isinstance(node,ast.ImportFrom): assert (node.module or "").split('.')[0] != "chokepoint_verifier"
