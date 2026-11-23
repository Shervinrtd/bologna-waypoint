import json
def dec(s):
    x=y=0; out=[]
    for tok in s.split():
        a,b=tok.split(','); x+=int(a); y+=int(b); out.append((11.2+x/1e5, 44.4+y/1e5))
    return out
def load():
    D={}
    lines=open('data/streets.txt').read().split('\n')
    names=json.loads(lines[0]); st=[]
    for l in lines[1:]:
        if not l.strip(): continue
        i,s=l.split(':',1); st.append((names[int(i)],dec(s)))
    D['streets']=st
    z=json.load(open('data/zones.json'))
    D['zones']=[(json.loads(x['name']),[dec(r) for r in x['r']]) for x in z['zones']]
    D['rail']=[dec(r) for r in z['rail']]
    D['contours']=[]
    for l in open('data/contours.txt').read().split('\n'):
        if l.strip():
            q,s=l.split(':',1); D['contours'].append((int(q),dec(s)))
    o=json.load(open('data/osm.json'))
    D['osm']={k:[dec(r) for r in v] for k,v in o.items() if v}
    return D
if __name__=='__main__':
    D=load()
    for k,v in D['osm'].items():
        pts=[p for r in v for p in r]; print(k,len(v),min(p[0] for p in pts),max(p[0] for p in pts),min(p[1] for p in pts),max(p[1] for p in pts))
    pts=[p for _,r in D['zones'] for rr in r for p in rr]; print('zones',min(p[0] for p in pts),max(p[0] for p in pts),min(p[1] for p in pts),max(p[1] for p in pts))
    print(len(D['streets']),len(D['rail']),len(D['contours']), sorted(set(q for q,_ in D['contours']))[:3], max(q for q,_ in D['contours']))
