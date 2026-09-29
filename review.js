(function(root){'use strict';
const core=root.HwpCompare;
const rangeRE=/^\[(\d+)\s*[~～∼–-]\s*(\d+)\]/;
const circled='➊➋➌➍➎➏➐➑➒➓',other='❶❷❸❹❺❻❼❽❾❿';
const noteRE=/[➲➜➔➤→↳⇒•●▪◆※]|(?:^|\n)\s*[·ㆍ]/;
const choices='①②③④⑤';
const norm=core.normalize;
// Only omit a Han parenthesis attached to a Korean term, and only when that
// term is unannotated in the target. Different supplied Han must still compare.
function sourceText(source,target){
  const skip=new Set(),compact=target.replace(/\s/g,'');
  const re=/([가-힣]+)\s*([（(]\s*[\p{Script=Han}][\p{Script=Han}\s·ㆍ]*[)）])/gu;
  for(const m of source.matchAll(re)){
    const base=m[1];if(!compact.includes(base)||new RegExp(base+'[（(][\\p{Script=Han}]','u').test(compact))continue;
    const a=m.index+m[0].indexOf(m[2]);for(let i=a;i<m.index+m[0].length;i++)skip.add(i);
  }
  let text='',map=[];for(let i=0;i<source.length;i++)if(!skip.has(i)){text+=source[i];map.push(i);}
  return {text,map};
}
function sourceNorm(source,target,omit=false){return norm(sourceText(source,target).text,omit);}
function align(target,source,partial=false,omit=false){
  const clean=sourceText(source,target),r=core.align(target,clean.text,partial,omit);if(!r)return null;
  r.refSpans=r.refSpans.map(s=>({start:clean.map[s.start],end:clean.map[s.end-1]+1}));return r;
}
function sentences(s){let result=[],start=0;for(let i=0;i<s.length;i++){
  if(!/[.!?。]/.test(s[i])||/\d/.test(s[i-1]||'')&&/\d/.test(s[i+1]||''))continue;
  let end=i+1;while(/[’”」』)）]/.test(s[end]||'\0'))end++;
  if(end<s.length&&!/\s/.test(s[end]))continue;
  let a=start;while(a<end&&/\s/.test(s[a]))a++;if(a<end)result.push({text:s.slice(a,end),start:a,end});start=end;i=end-1;
}let a=start,b=s.length;while(a<b&&/\s/.test(s[a]))a++;while(b>a&&/\s/.test(s[b-1]))b--;if(a<b)result.push({text:s.slice(a,b),start:a,end:b});return result;}
function similarity(a,b){if(a===b)return 1;const grams=s=>new Set(Array.from({length:Math.max(0,s.length-1)},(_,i)=>s.slice(i,i+2)));let aa=grams(a),bb=grams(b),n=0;for(let x of aa)if(bb.has(x))n++;return aa.size+bb.size?2*n/(aa.size+bb.size):0;}
function trackOf(t,prev){return /(?:국어 영역|선택\s*과목).*화법과 작문/.test(t)?'화작':/(?:국어 영역|선택\s*과목).*언어와 매체/.test(t)?'언매':prev;}
function detectRanges(...docs){const found=new Map();for(const doc of docs)for(const p of doc.paragraphs){const t=p.text.trim(),m=t.match(rangeRE);if(!m)continue;const category=t.slice(m[0].length).match(/^\s*[（(]?\s*(과학|기술)(?=[)）\s:：·ㆍ/]|$)/);if(!category)continue;const key=m[1]+'-'+m[2];if(!found.has(key))found.set(key,{range:key,start:+m[1],end:+m[2],subjects:[]});const x=found.get(key);if(!x.subjects.includes(category[1]))x.subjects.push(category[1]);}return [...found.values()].sort((a,b)=>a.start-b.start);}
function sourceIndex(doc){const pool=[],paragraphs=[],blocks=[],options=new Map();let range='',track='공통',q=0,pn=0,part='',passage=false,last='',optionKey='';
  for(const p of doc.paragraphs){let t=p.text.trim();if(!t)continue;track=trackOf(t,track);let m=t.match(rangeRE);if(m){range=m[1]+'-'+m[2];if(+m[1]<35)track='공통';q=+m[1];pn=0;part='';passage=true;last='';optionKey='';continue;}if(!range)continue;
    if(/저작권|제\d교시|학년도.*(?:모의|감수)|^국어 영역|^홀수형|^짝수형/.test(t))continue;
    if(/^\[글의 초고\]$/.test(t)){pn=0;part='';passage=true;continue;}
    const sub=t.match(/^\(([가나다])\)(?:\s+|$)/);if(sub&&passage){part=sub[1];pn=0;t=t.slice(sub[0].length).trim();if(!t)continue;}
    let op=t.match(/^([①②③④⑤])\s*(.+)/s);if(op&&op[2].length>5){if(op[1]==='①'&&last==='⑤')q++;last=op[1];passage=false;optionKey=[track,range,q,op[1]].join(':');const item={text:op[2],range,track,q,kind:'option',label:q+'번 '+op[1],paraId:p.id};options.set(optionKey,item);pool.push(item);blocks.push(item);continue;}
    if(/^ⓑ\s*[:：]/.test(t)&&optionKey){const item=options.get(optionKey);if(item){item.cont=t;pool.push({...item,text:t,label:item.label+' ⓑ'});}continue;}
    if(/것은[?？]|물음에 답/.test(t)||/^\s*\d+[.)]\s/.test(t)){passage=false;continue;}
    if(norm(t).length<10)continue;
    const para={text:t,range,track,q,part,pn:passage?++pn:null,kind:passage?'passage':'view',paraId:p.id};para.label=passage?(part?'('+part+') ':'')+pn+'문단':q+'번 본문·보기';blocks.push(para);
    if(passage)paragraphs.push(para);
    sentences(t).forEach((s,i)=>pool.push({...para,text:s.text.replace(/^[가-힣\d]{1,10}\s*[:：]\s*/,''),sn:i+1,start:s.start,end:s.end,label:para.label+' '+(i+1)+'문장'}));
  }return {pool,paragraphs,blocks,options};
}
function targetData(doc,source=null){const items=[],questions=new Set();let range='',q=0,choice='',track='공통',analysis=false,pn=0,part='',first=false,active=false,layout='inline',answer='',subject='';
  const add=(p,start,end,kind,label,extra={})=>{while(start<end&&/\s/.test(p.text[start]))start++;while(end>start&&/\s/.test(p.text[end-1]))end--;if(start>=end)return;items.push({id:items.length,paraId:p.id,start,end,text:p.text.slice(start,end),kind,label,range,q:analysis?null:q,choice,track,analysis,pn,part,...extra});};
  for(let pi=0;pi<doc.paragraphs.length;pi++){const p=doc.paragraphs[pi],t=p.text,tr=t.trim();if(!tr)continue;track=trackOf(tr,track);
    if(/주요\s*지문\s*분석|^지문\s*분석(?:지)?$/.test(tr)){analysis=true;pn=0;q=0;continue;}
    let m=tr.match(rangeRE);if(m){range=m[1]+'-'+m[2];q=+m[1]-1;part='';pn=0;first=false;active=true;subject=tr.slice(m[0].length);if(+m[1]<35)track='공통';continue;}
    if(!active)continue;
    if(analysis){let pm=tr.match(/^(\d+)\s*문단(?:\s|$)/),sub=tr.match(/^\(([가나다])\)$/);if(sub){part=sub[1];pn=0;continue;}if(pm){pn=+pm[1];first=true;continue;}if(!pn)continue;
      const ni=t.search(noteRE),end=ni<0?t.length:ni,copy=t.slice(0,end).trim();
      const next=doc.paragraphs.slice(pi+1).find(p=>p.text.trim());if(next&&/^\d+\s*문단(?:\s|$)/.test(next.text.trim()))continue;
      const known=norm(copy).length>=8&&source?.paragraphs.some(s=>s.range===range&&s.pn===pn&&s.part===part&&sourceNorm(s.text,copy,true).includes(norm(copy)));
      const sourceLike=copy.length>=8&&(known||first||(/다\.[\s]*$/.test(copy)&&norm(copy).length>30));
      if(sourceLike){add(p,0,end,'analysis-source',range+' 지문 분석 '+(part?'('+part+') ':'')+pn+'문단');first=false;}
      if(ni>=0)add(p,ni,t.length,'analysis-note',range+' 지문 분석 '+pn+'문단 설명');
      else if(!sourceLike&&tr.length>=8)add(p,0,t.length,'analysis-note',range+' 지문 분석 '+pn+'문단 설명');
      continue;
    }
    const qm=tr.match(/^(\d+)\.\s*.+정답/);if(qm){layout='inline';q=+qm[1];choice='';part='';questions.add(q);continue;}
    if(tr==='정답'){layout='separate';q++;questions.add(q);choice=answer;part='';continue;}
    if(/^[①②③④⑤]$/.test(tr)){answer=tr;continue;}
    if(tr==='해설'){choice=answer;continue;}if(tr==='오답풀이')continue;
    if(!questions.has(q))continue;
    // Arabic labels require a sentence/box boundary so "6-4 광생성물" is not a label.
    const isBox=/^\s*(?:\[[^\]\n]+\]\s*[-－]\s*)?(?:\([가나다]\)\s*[-－]?\s*)?(?:[➊➋➌➍➎➏➐➑➒➓❶❷❸❹❺❻❼❽❾❿]|\d{1,2})\s*[-－]\s*\d+/.test(t);
    const labels=isBox?[...t.matchAll(/(?:\[[^\]\n]+\]\s*[-－]\s*)?(?:\(([가나다])\)\s*[-－]?\s*)?([➊➋➌➍➎➏➐➑➒➓❶❷❸❹❺❻❼❽❾❿]|(?<=^\s*|[.!?]\s+|\n\s*)\d{1,2})\s*[-－]\s*(\d+)\s*/g)]:[];
    if(labels.length){for(let j=0;j<labels.length;j++){const l=labels[j];if(l[1])part=l[1];const np=circled.indexOf(l[2])+1||other.indexOf(l[2])+1||+l[2],start=l.index+l[0].length,end=j+1<labels.length?labels[j+1].index:t.length;let cursor=start,segment=0;
      for(const e of t.slice(start,end).matchAll(/\(\s*[…⋯]+\s*\)|[…⋯]+|\.{3,}/g)){add(p,cursor,start+e.index,'evidence',q+'번 지문 박스 '+l[0].trim(),{pn:np,sn:+l[3],part,fragment:segment++});cursor=start+e.index+e[0].length;}
      add(p,cursor,end,'evidence',q+'번 지문 박스 '+l[0].trim(),{pn:np,sn:+l[3],part,fragment:segment});}continue;}
    const op=t.match(/^\s*([①②③④⑤])\s*/);if(op)choice=op[1];
    if(layout==='inline'&&op&&tr.length>8){add(p,op[0].length,t.length,'option',q+'번 '+choice+' 선지');continue;}
    if(layout==='inline'&&/^\s*ⓑ\s*[:：]/.test(t)&&choice){add(p,0,t.length,'option-cont',q+'번 '+choice+' 선지 ⓑ');continue;}
    if(layout==='inline'&&/^\s*<보기>/.test(t)){const start=t.indexOf('<보기>')+4;let cursor=start;for(const e of t.slice(start).matchAll(/\(\s*[…⋯]+\s*\)|[…⋯]+|\.{3,}/g)){add(p,cursor,start+e.index,'view',q+'번 <보기> 발췌');cursor=start+e.index+e[0].length;}add(p,cursor,t.length,'view',q+'번 <보기> 발췌');continue;}
    if(layout==='separate'||/^\s*▶/.test(t)){for(const quote of t.matchAll(/‘([^’]*)’|“([^”]*)”|「([^」]*)」|『([^』]*)』/g)){const inner=quote[1]??quote[2]??quote[3]??quote[4];if(!norm(inner))continue;const tail=t.slice(quote.index+quote[0].length,quote.index+quote[0].length+30);const definition=/^\s*(?:라는|라는? 뜻|의|이라는|란)?\s*(?:의미|뜻)/.test(tail);add(p,quote.index+1,quote.index+1+inner.length,definition?'definition':'quote',q+'번 '+choice+(definition?' 뜻풀이':' 해설 인용'),{short:norm(inner).length<8});}}
  }return {items,available:[...questions].sort((a,b)=>a-b),layout};
}
function windows(blocks,text){let count=sentences(text).length,out=[];for(const b of blocks){let ss=sentences(b.text);for(let i=0;i<ss.length;i++)for(let size=Math.max(1,count-1);size<=count+1&&i+size<=ss.length;size++)out.push({...b,text:b.text.slice(ss[i].start,ss[i+size-1].end),sn:i+1});}return out;}
function compare(target,reference,opts={}){
  const src=sourceIndex(reference),data=targetData(target,src),selection=typeof opts.questions==='string'?core.parseSelection(opts.questions):opts.questions||null;
  if(selection){let missing=[...selection].filter(q=>!data.available.includes(q));if(missing.length)throw Error('해설지에서 찾지 못한 문제 번호: '+missing.join(', '));}
  const chosen=core.selectItems(data.items,selection,opts.includeAnalysis!==false);
  if(!chosen.length)throw Error('검사할 인용·지문 박스를 찾지 못했습니다. 문서의 편집 형식을 확인해 주세요.');
  function unknown(it,reason,ref=null,status='unmatched'){return {...it,status,reference:ref?.text||'',sourceLabel:ref?.label||'',reason,spans:[],refSpans:[],changes:[],location:null};}
  function ranked(list,it,omit){const unique=new Map();for(const s of list){const n=sourceNorm(s.text,it.text,omit),key=n+'|'+s.pn+'|'+s.sn+'|'+s.part;if(!unique.has(key))unique.set(key,{...s,score:similarity(norm(it.text),n)});}return [...unique.values()].sort((a,b)=>b.score-a.score);}
  const results=chosen.map(it=>{
    const inScope=s=>{const [a,b]=s.range.split('-').map(Number);return s.track===it.track&&(s.range===it.range||(!it.analysis&&it.q>=a&&it.q<=b));};
    const omit=it.analysis||it.kind==='quote',n=norm(it.text),scope=src.pool.filter(inScope),blocks=src.blocks.filter(inScope),body=scope.filter(s=>s.kind==='passage');
    const para=src.paragraphs.filter(s=>s.range===it.range&&s.track===it.track&&s.pn===it.pn&&s.part===it.part);
    if(it.kind==='analysis-note')return unknown(it,'分析 설명은 원문 일치 검사의 대상이 아닙니다.'.replace('分析','분석'),para[0],'review');
    if(it.kind==='definition')return unknown(it,'사전적 뜻풀이로 구분했습니다. 문제지에 없다는 이유로 차이를 표시하지 않습니다.',null,'review');
    let direct=null,partial=false,reason='',location=null;
    const exact=s=>sourceNorm(s.text,it.text,omit).includes(n);
    if(it.kind==='option'||it.kind==='option-cont'){const o=src.options.get([it.track,it.range,it.q,it.choice].join(':'));if(o)direct={...o,text:it.kind==='option-cont'?o.cont||'':o.text};reason='같은 문항·선지 대조';}
    else if(it.kind==='evidence'){
      const expected=body.filter(s=>s.pn===it.pn&&s.sn===it.sn&&(!it.part||s.part===it.part));
      const hits=body.filter(s=>exact(s)&&n.length>=8),same=expected.find(exact);
      if(same){direct=same;location={status:'match',expected:it.pn+'-'+it.sn,actual:same.pn+'-'+same.sn};}
      else if(hits.length===1){direct=hits[0];location={status:it.fragment?'review':'different',expected:it.pn+'-'+it.sn,actual:(direct.part?'('+direct.part+') ':'')+direct.pn+'-'+direct.sn};}
      else if(hits.length>1){direct=hits[0];location={status:'review',expected:it.pn+'-'+it.sn,actual:'동일 문구가 여러 위치에 있음'};}
      else {const scores=ranked(body,it,false),best=scores[0],next=scores[1];if(best?.score>=.8&&(!next||best.score-next.score>.1)){direct=best;location={status:best.pn===it.pn&&best.sn===it.sn&&(!it.part||best.part===it.part)?'match':'review',expected:it.pn+'-'+it.sn,actual:(best.part?'('+best.part+') ':'')+best.pn+'-'+best.sn};}else if(expected.length===1){direct=expected[0];location={status:'review',expected:it.pn+'-'+it.sn,actual:'표시된 번호의 원문과 내용 확인 필요'};}}
      if(location?.status==='different'&&it.track!=='공통')location.status='review';
      reason='지문 박스의 문구와 문단·문장 번호를 각각 대조';
      if(!location)location={status:'review',expected:it.pn+'-'+it.sn,actual:'원문 위치 확인 필요'};
    }
    else if(it.kind==='analysis-source'){
      direct=para.find(exact);partial=true;
      if(!direct){const candidates=ranked(para,it,true);if(candidates[0]?.score>=.45)direct=candidates[0];}
      reason='원문 덩어리 대조 · 화살표·글머리표 설명 제외';
    }
    if(!direct){const hits=[...scope,...blocks].filter(exact);if(hits.length){direct=hits[0];partial=true;reason='연속된 원문 구간과 대조';}
      else if(it.short)return unknown(it,'짧은 용어·표현은 원문 인용 여부를 확인해 주세요.',null,'review');
      else if(it.kind!=='analysis-source'&&it.kind!=='evidence'&&it.kind!=='option'&&it.kind!=='option-cont'){
        const scored=ranked(windows(blocks,it.text),it,omit),best=scored[0],next=scored[1];if(best?.score>=.65&&(!next||best.score-next.score>=.07)){direct=best;partial=true;reason='유사한 원문 구간과 대조 · 연결 위치 확인 필요';}
        else return unknown(it,'대응을 확정하지 못했습니다. 원문에 없는 오류라고 단정하지 않습니다.',best?.score>.25?best:null);
      }
    }
    if(!direct)return {...unknown(it,'대응 원문을 찾지 못했습니다.'),location};
    const diff=align(it.text,direct.text,partial,omit);if(!diff||diff.coverage<.65)return {...unknown(it,'원문 연결을 확정하기 어려워 차이 표시를 보류했습니다.',direct),location};
    const status=diff.changes.length?'different':location&&location.status!=='match'?'location':'match';
    return {...it,status,reference:direct.text,sourceLabel:direct.label,reason,location,...diff};
  });
  return {items:results,available:data.available,selected:selection?[...selection].sort((a,b)=>a-b):null,scienceRanges:detectRanges(target,reference),counts:Object.fromEntries(['match','different','location','unmatched','review'].map(s=>[s,results.filter(i=>i.status===s).length])),analysisCount:results.filter(i=>i.analysis).length,analysisBlocks:results.filter(i=>i.kind==='analysis-source').length};
}
root.HwpCompare={...core,compare,targets:doc=>targetData(doc).items,targetData,sourceIndex,detectRanges,align,sourceText,sourceNorm,sentences};
})(globalThis);
