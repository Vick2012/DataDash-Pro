import sys, json
import pandas as pd
p = r"C:\Users\USER\Downloads\Consolidado Minutas Marzo 2026.xlsx"
try:
    xls = pd.read_excel(p, sheet_name=None, engine='openpyxl')
except Exception as e:
    print(json.dumps({"error": str(e)}))
    sys.exit(0)
# find 'Base' sheet case-insensitive
sheet_name = None
for s in xls.keys():
    if s.strip().lower() == 'base':
        sheet_name = s
        break
if sheet_name is None:
    # fallback: choose first sheet that has a header matching actividad
    for s, df in xls.items():
        cols = [str(c).strip().lower() for c in df.columns]
        for alias in ['actividad','nomactividad','proceso']:
            if any(alias in c for c in cols):
                sheet_name = s
                break
        if sheet_name:
            break
if sheet_name is None:
    # fallback to first sheet
    sheet_name = list(xls.keys())[0]

df = xls[sheet_name]
cols = {str(c).strip().lower(): c for c in df.columns}
act_col = None
for alias in ['actividad','nomactividad','actividad','proceso','nomactividad']:
    for k,v in cols.items():
        if alias == k or alias in k:
            act_col = v
            break
    if act_col:
        break
if act_col is None:
    print(json.dumps({"error": "No se encontró columna 'actividad' en la hoja seleccionada ('%s')" % sheet_name}))
    sys.exit(0)
vals = df[act_col].fillna('').astype(str).str.strip()
uniq = sorted([v for v in vals.unique() if v is not None and v.strip()!=''])
print(json.dumps({"sheet": sheet_name, "activity_count": len(uniq), "activities": uniq}, ensure_ascii=False, indent=2))
