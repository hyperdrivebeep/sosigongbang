from pathlib import Path
import sys, shutil, json, zipfile
root=Path(__file__).resolve().parent.parent
work=root/'work'
out=root/'outputs'/'소식공방'
skill=work/'academy-cardnews'
jszip=(Path(sys.argv[1])/'node/node_modules/jszip') if len(sys.argv)>1 else (root/'node_modules/jszip')
html=(work/'editor.html').read_text('utf8')
for marker,source in [('/*CSS*/',work/'editor.css'),('/*ZIP*/',jszip/'dist/jszip.min.js'),('/*RENDER*/',work/'render.js'),('/*PUBLISH*/',work/'publish.js'),('/*APP*/',work/'app.js'),('__DECK__',work/'sample.json')]:
    html=html.replace(marker,source.read_text('utf8'))
(out/'소식공방.html').write_text(html,'utf8')
(skill/'assets').mkdir(exist_ok=True)
shutil.copyfile(out/'소식공방.html',skill/'assets/studio.html')
shutil.copyfile(jszip/'LICENSE.markdown',skill/'assets/JSZip-LICENSE.txt')
shutil.copyfile(jszip/'LICENSE.markdown',out/'JSZip-LICENSE.txt')
shutil.copytree(skill,out/'.agents/skills/academy-cardnews',dirs_exist_ok=True,ignore=shutil.ignore_patterns('__pycache__'))
example=out/'예시/시험 전날 편집본.html'
sample_zip=out/'예시/ChatGPT가 만든 시험 전날 카드.zip'
if sample_zip.exists():
    with zipfile.ZipFile(sample_zip) as z:
        data=json.loads(z.read('편집 원본.cardnews'))
    data['instance']='exam-eve-example-v1'
    seed=json.dumps(data,ensure_ascii=False).replace('<',r'\u003c').replace('>',r'\u003e')
    example.write_text(html.replace((work/'sample.json').read_text('utf8'),seed,1),'utf8')
with zipfile.ZipFile(out/'academy-cardnews.zip','w',zipfile.ZIP_DEFLATED) as z:
    for p in skill.rglob('*'):
        if p.is_file() and '__pycache__' not in p.parts:
            z.write(p,p.relative_to(skill.parent))
