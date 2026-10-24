import hashlib
import subprocess

import pytest

from chokepoint_verifier.canonical import canonical_bytes


# Independently authored UTF-8 bytes; do not derive this literal from canonical_bytes.
VECTOR = b'{"checks":[{"code":"A","passed":true},{"code":"B","passed":false}],"n":7,"unicode":"caf\xc3\xa9"}'
VECTOR_SHA256 = "041828307fdf1ddf319469b385146ccd916d12b70043e3bbb42dbcdd85a9f01d"


def test_canonical_receipt_vector_matches_shell_hash_tools():
    value = {"unicode": "café", "n": 7, "checks": [{"code": "A", "passed": True}, {"code": "B", "passed": False}]}
    assert canonical_bytes(value) == VECTOR
    assert hashlib.sha256(VECTOR).hexdigest() == VECTOR_SHA256
    shasum = subprocess.check_output(["shasum", "-a", "256"], input=VECTOR).decode().split()[0]
    openssl = subprocess.check_output(["openssl", "dgst", "-sha256"], input=VECTOR).decode().split("=")[-1].strip()
    assert shasum == VECTOR_SHA256
    assert openssl == VECTOR_SHA256


@pytest.mark.parametrize(
    "value",
    [
        {"a": 2**53},
        {"a": 1.0},
        {"a": (1, 2)},
        {"é": 1},
        {"a": "bad\ud800"},
    ],
)
def test_canonical_rejects_non_spec_json_values(value):
    with pytest.raises(ValueError):
        canonical_bytes(value)
