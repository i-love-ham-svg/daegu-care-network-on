const fs = require('node:fs');
const path = require('node:path');
const runtime = require('./runtime.cjs');
module.exports = function catalog() {
  const r = runtime('const onSocialThumbnails = {};');
  return JSON.parse(r.run(`JSON.stringify({
    sections:onPublicSections,photos:photoData,imagePreviews:onImagePreviews,organizations,channels:onShareChannels,
    items:[...items('news'),...items('policy'),...items('event'),...items('resource')],
    routes:[...Object.keys(onPublicSections),...organizations.map(x=>'member/'+x.id),
      ...['news','policy','event','resource'].flatMap(type=>items(type).map(x=>'detail/'+x.id)),
      ...Object.keys(photoData).filter(key=>!photoData[key].illustrative).map(key=>'gallery/'+key)]
  })`));
};
if (require.main === module) {
  const data = module.exports();
  fs.mkdirSync(path.join(__dirname,'../output/work'),{recursive:true});
  fs.writeFileSync(path.join(__dirname,'../output/work/catalog.json'),JSON.stringify(data,null,2));
  console.log(JSON.stringify({routes:data.routes.length,photos:Object.keys(data.photos).length,organizations:data.organizations.length}));
}
