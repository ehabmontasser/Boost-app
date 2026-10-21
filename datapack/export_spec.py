"""Exports spec.py to ../lib/spec.json so the app validates with the same standard as the generator."""
import json, os
import spec
def cols(cs): return [dict(name=c["name"], dtype=c["dtype"], required=c["required"], allowed=c["allowed"]) for c in cs]
out = dict(
    template_version=spec.TEMPLATE_VERSION,
    platforms={k: dict(code=v[0], folder=v[1]) for k, v in spec.PLATFORM_FOLDERS.items()},
    feed_order=spec.FEED_ORDER,
    feeds={k: dict(num=f["num"], title=f["title"], freq=f["freq"], key=f["key"], cols=cols(f["cols"]),
                   **({"cols_category": cols(f["cols_category"]), "key_category": f["key_category"]} if k == "MARKET" else {}))
           for k, f in spec.FEEDS.items()},
    setup={k: dict(key=s["key"], cols=cols(s["cols"])) for k, s in spec.SETUP_SHEETS.items()},
)
os.makedirs("../lib", exist_ok=True)
json.dump(out, open("../lib/spec.json", "w"), indent=1)
print("ok", len(json.dumps(out)))
