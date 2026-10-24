import json

def canonical_bytes(value):
    def reject(x):
        if isinstance(x,float): raise ValueError("floats are not allowed")
        if isinstance(x,dict):
            for k,v in x.items():
                if not isinstance(k,str): raise ValueError("keys must be strings")
                reject(v)
        elif isinstance(x,list):
            for v in x: reject(v)
    reject(value)
    return json.dumps(value,ensure_ascii=False,sort_keys=True,separators=(",",":"),allow_nan=False).encode("utf-8")
