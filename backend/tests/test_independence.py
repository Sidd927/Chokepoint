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
