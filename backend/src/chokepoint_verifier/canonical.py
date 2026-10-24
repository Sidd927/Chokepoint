import json

SAFE_INTEGER = 2**53 - 1

def canonical_bytes(value):
    def reject(x):
        if type(x) is bool or x is None:
            return
        if type(x) is int:
            if not -SAFE_INTEGER <= x <= SAFE_INTEGER:
                raise ValueError("integer is outside the safe JSON range")
            return
        if type(x) is str:
            if any(0xD800 <= ord(c) <= 0xDFFF for c in x):
                raise ValueError("invalid Unicode surrogate")
            return
        if type(x) is dict:
            for k,v in x.items():
                if type(k) is not str or not k.isascii(): raise ValueError("keys must be ASCII strings")
                reject(v)
        elif type(x) is list:
            for v in x: reject(v)
        else:
            raise ValueError("only JSON values are allowed")
    reject(value)
    return json.dumps(value,ensure_ascii=False,sort_keys=True,separators=(",",":"),allow_nan=False).encode("utf-8")
