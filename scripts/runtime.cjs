const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

module.exports = function runtime(extra = '', saved = {}) {
  const node = {addEventListener(){},classList:{add(){},remove(){}},querySelector(){return node},querySelectorAll(){return []}};
  const document = {addEventListener(){},querySelector(){return node},querySelectorAll(){return []},documentElement:{dataset:{}}};
  const context = vm.createContext({document,window:{addEventListener(){},matchMedia(){return {matches:false,addEventListener(){}}}},
    location:{href:'https://daegu-care.oconia.co.kr/',pathname:'/',hash:''},history:{},navigator:{},
    localStorage:{getItem(key){return saved[key]??null},setItem(){}},URL,Intl,structuredClone,console,
    setTimeout(){},clearTimeout(){},requestAnimationFrame(){}});
  const source = fs.readFileSync(path.join(__dirname,'../src/app.js'),'utf8').replace(/render\(\);\s*$/, '');
  const contentPhotos=JSON.parse(fs.readFileSync(path.join(__dirname,'../src/content-photos.json'),'utf8'));
  const researchedNews=JSON.parse(fs.readFileSync(path.join(__dirname,'../src/researched-news.json'),'utf8'));
  const release=JSON.parse(fs.readFileSync(path.join(__dirname,'../src/release-content.json'),'utf8'));
  vm.runInContext('const onReleaseContent = '+JSON.stringify(release)+';\nconst onContentCasePhotos = '+JSON.stringify(contentPhotos)+';\nconst onResearchedNews = '+JSON.stringify(researchedNews)+';\n'+extra+'\n'+source, context, {timeout:5000});
  return {context,run(code){return vm.runInContext(code,context,{timeout:5000})}};
};
