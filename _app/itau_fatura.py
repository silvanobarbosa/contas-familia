import re,sys,pdfplumber
def num(s): return float(s.replace('.','').replace(',','.'))
def col_lines(page,x0,x1):
    ws=[w for w in page.extract_words() if x0<=w['x0']<x1]
    ws.sort(key=lambda w:(round(w['top']),w['x0']))
    rows=[]
    for w in ws:
        if rows and abs(rows[-1][0]-w['top'])<=2.5: rows[-1][1].append(w)
        else: rows.append([w['top'],[w]])
    out=[]
    for top,r in rows:
        r.sort(key=lambda w:w['x0']);s=r[0]['text']
        for a,b in zip(r,r[1:]): s+=('   ' if b['x0']-a['x1']>6 else ' ')+b['text']
        out.append(s)
    return out
def parse(path):
    with pdfplumber.open(path) as pdf:
        full="\n".join((p.extract_text() or "") for p in pdf.pages)
        lines=[]
        for i,p in enumerate(pdf.pages):
            if i==0: continue
            lines+=col_lines(p,0,360)+col_lines(p,360,9999)
    g=lambda rx:(re.search(rx,full))
    vd,vm,vy=g(r'Vencimento:\s*(\d\d)/(\d\d)/(\d{4})').groups()
    total=num(g(r'Total desta fatura\s+([\d.]+,\d\d)').group(1))
    L=num(g(r'Total dos lançamentos atuais\s+([\d.]+,\d\d)').group(1))
    e=g(r'Total de encargos em R\$\s+([\d.]+,\d\d)');enc=num(e.group(1)) if e else 0.0
    a=g(r'Total da fatura anterior\s+([\d.]+,\d\d)');ant=num(a.group(1)) if a else 0.0
    pg=g(r'Pagamento efetuado em (\d\d/\d\d/\d{4})\s+-\s*([\d.]+,\d\d)')
    fech=g(r'Emissão:\s*(\d\d)/(\d\d)/(\d{4})')
    tx=[];sec=None;owner=None;fin=None;subt={}
    for s in lines:
        s=s.strip()
        if s.startswith('Lançamentos: compras e saques'): sec='compras';continue
        if s.startswith('Lançamentos internacionais'): sec='inter';continue
        if s.startswith('Lançamentos: produtos e serviços'): sec='prod';continue
        if s.startswith('Compras parceladas') or s.startswith('L Total dos lançamentos') or s.startswith('Simulação'): sec=None;continue
        if not sec: continue
        m=re.match(r'^(.+?) \(final (\d{4})\)$',s)
        if m: owner,fin=m.group(1),m.group(2);continue
        m=re.match(r'^Lançamentos no cartão \(final (\d{4})\)\s+([\d.]+,\d\d)',s)
        if m: subt[m.group(1)]=round(subt.get(m.group(1),0)+num(m.group(2)),2);continue
        m=re.match(r'^Repasse de IOF em R\$\s+([\d.]+,\d\d)',s)
        if m: tx.append(dict(d=None,desc='IOF compras internacionais',v=num(m.group(1)),parc='',cat='',own=owner,fin=fin,sec='inter'));continue
        m=re.match(r'^(\d\d)/(\d\d)\s+(.+?)\s{3}(-?[\d.]+,\d\d)(?:\s{3}\S.*)?$',s)
        if m:
            dd,mm,desc,v=m.groups();desc=desc.strip();parc=''
            pm=re.search(r'\s*(\d\d)/(\d\d)$',desc)
            if pm and sec=='compras': parc=pm.group(1)+'/'+pm.group(2);desc=desc[:pm.start()].strip()
            tx.append(dict(d=(dd,mm),desc=desc,v=num(v),parc=parc,cat='',own=owner if sec!='prod' else '',fin=fin if sec!='prod' else '',sec=sec));continue
        m=re.match(r'^([A-ZÀ-Ü][A-ZÀ-Ü ]+?)\s?\.(\S.*)$',s)
        if m and tx and not tx[-1]['cat'] and tx[-1]['sec']=='compras': tx[-1]['cat']=m.group(1).strip()
    vy,vm=int(vy),int(vm)
    fd=f"{fech.group(3)}-{fech.group(2)}-{fech.group(1)}" if fech else f"{vy}-{vm:02d}-01"
    for t in tx:
        if t['d'] is None: t['date']=fd;continue
        dd,mm=int(t['d'][0]),int(t['d'][1]);y=vy if mm<=vm else vy-1
        t['date']=f"{y}-{mm:02d}-{dd:02d}"
    soma=round(sum(t['v'] for t in tx),2)
    return dict(venc=f"{vy}-{vm:02d}-{vd}",fech=fd,total=total,L=L,enc=enc,ant=ant,pago=(num(pg.group(2)) if pg else 0.0),pago_em=(pg.group(1) if pg else ''),tx=tx,soma=soma,subt=subt)
if __name__=='__main__':
    for f in sys.argv[1:]:
        r=parse(f);print(f.split('/')[-1][14:],r['venc'],'L',r['L'],'soma',r['soma'],'OK' if abs(r['soma']-r['L'])<0.02 else 'DIF %.2f'%(r['soma']-r['L']),'n',len(r['tx']),'enc',r['enc'],'subt',sum(r['subt'].values()),r['subt'])
