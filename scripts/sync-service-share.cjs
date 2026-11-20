const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const {collectServiceShareCandidates}=require('./prepare-service-share.cjs');
const root=path.resolve(__dirname,'..');
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function syncServiceShare(){
  const values=JSON.parse(fs.readFileSync(path.join(root,'src/service-share-values.json'),'utf8'));
  const feedData=values.feedFile?JSON.parse(fs.readFileSync(path.resolve(root,values.feedFile),'utf8')):[];
  const feed=Array.isArray(feedData)?feedData:feedData.photos;
  const data=collectServiceShareCandidates({catalog:require('./social-catalog.cjs')(),feed,values});
  const renderer=path.join(root,'scripts/render-service-share.py');
  const sourceFiles=data.photos.map(photo=>({file:photo.file,sha256:sha(fs.readFileSync(path.join(root,'docs/media',photo.file)))}));
  const inputSHA256=sha(JSON.stringify({data,sourceFiles,renderer:sha(fs.readFileSync(renderer))}));
  const stampFile=path.join(root,'src/service-share-input.json');
  const previous=fs.existsSync(stampFile)?JSON.parse(fs.readFileSync(stampFile,'utf8')):{};
  const catalogFile=path.join(root,'docs/service-share-catalog.json');
  const catalog=fs.existsSync(catalogFile)?JSON.parse(fs.readFileSync(catalogFile,'utf8')):null;
  const ready=catalog?.photos.every(photo=>fs.existsSync(path.join(root,'docs/media',photo.posterFile)));
  if(previous.inputSHA256===inputSHA256&&ready)return {changed:false,photos:catalog.photos.length,latest:catalog.latest.length};
  const exe=process.platform==='win32'?'python.exe':'python3';
  const choices=[process.env.DAEGU_CARE_PYTHON,
    path.resolve(path.dirname(process.execPath),'../../python',exe),
    path.resolve(path.dirname(process.execPath),'../python',exe),
    ...(process.env.PATH||'').split(path.delimiter).map(folder=>path.join(folder,exe))];
  const python=choices.find(file=>file&&fs.existsSync(file)&&!/AppData[\\/]Local[\\/]Microsoft[\\/]WindowsApps/i.test(file));
  if(!python)throw Error('Set DAEGU_CARE_PYTHON to a Python executable with Pillow to refresh representative share photos.');
  execFileSync(process.execPath,[path.join(root,'scripts/prepare-service-share.cjs')],{cwd:root,stdio:'inherit'});
  execFileSync(python,[renderer],{cwd:root,stdio:'inherit',env:{...process.env,PYTHONIOENCODING:'utf-8'}});
  fs.writeFileSync(stampFile,JSON.stringify({version:1,inputSHA256},null,2)+'\n');
  const current=JSON.parse(fs.readFileSync(catalogFile,'utf8'));
  return {changed:true,photos:current.photos.length,latest:current.latest.length};
}
module.exports=syncServiceShare;
if(require.main===module)console.log(JSON.stringify(syncServiceShare()));
