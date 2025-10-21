// Google Sheets
function toPT(dateStr){
  if(!dateStr) return "";
  const dt=new Date(dateStr);
  dt.setHours(dt.getHours()-3);
  return new Intl.DateTimeFormat("en-US",{
    timeZone:"America/Los_Angeles",year:"numeric",month:"short",day:"numeric",
    hour:"numeric",minute:"2-digit",hour12:true
  }).format(dt)+" PT";
}

const tbody=document.querySelector("#leaderboard tbody");
const lastUpdatedEl=document.getElementById("last-updated");

function parseCurrency(s){
  if(typeof s!=="string")return NaN;
  return parseFloat(s.replace(/[^0-9.-]/g,""));
}
function parsePercent(s){
  if(typeof s!=="string")return NaN;
  return parseFloat(s.replace(/%/g,""));
}

function renderTable(rows){
  tbody.innerHTML="";
  rows.forEach(r=>{
    const tr=document.createElement("tr");
    tr.innerHTML=`
      <td>${r["Rank"] ?? ""}</td>
      <td>${r["Name (ID)"] ?? ""}</td>
      <td>${r["Region Rank"] ?? ""}</td>
      <td>${r["Return %"] ?? ""}</td>
      <td>${r["Total Equity"] ?? ""}</td>
    `;
    tbody.appendChild(tr);
  });
}

function sortByKey(rows,key,numeric=false){
  const copy=[...rows];
  copy.sort((a,b)=>{
    const A=a[key] ?? "";
    const B=b[key] ?? "";
    if(numeric){
      const x=key==="Return %"?parsePercent(A):parseCurrency(A);
      const y=key==="Return %"?parsePercent(B):parseCurrency(B);
      if(isNaN(x)&&isNaN(y))return 0;
      if(isNaN(x))return 1;
      if(isNaN(y))return -1;
      return y-x;
    }else{
      return (""+A).localeCompare(""+B);
    }
  });
  return copy;
}

function attachSorting(rows){
  const headers=document.querySelectorAll("th.sortable");
  headers.forEach(th=>{
    let asc=false;
    th.addEventListener("click",()=>{
      const key=th.dataset.key;
      const numeric=(key==="Region Rank"||key==="Return %"||key==="Rank");
      const sorted=sortByKey(rows,key,numeric);
      if(asc)sorted.reverse();
      asc=!asc;
      renderTable(sorted);
    });
  });
}

function updateTimestamp(){
  const now=new Date();
  lastUpdatedEl.textContent=`Refreshed: ${now.toLocaleString("en-US",{timeZone:"America/Los_Angeles"})} PT`;
}

function loadCSV(){
  if(!SHEET_CSV_URL){
    tbody.innerHTML=`<tr><td colspan="5">Missing Google Sheet CSV URL.</td></tr>`;
    return;
  }
  Papa.parse(SHEET_CSV_URL,{
    download:true,
    header:true,
    complete:(results)=>{
      const rows=results.data.filter(r=>Object.values(r).some(v=>v&&String(v).trim()!==""));
      let sorted=rows;
      if(rows[0]&&"Rank" in rows[0]){
        sorted=rows.slice().sort((a,b)=>(parseFloat(a["Rank"])||999)-(parseFloat(b["Rank"])||999));
      }else if(rows[0]&&"Return %" in rows[0]){
        sorted=sortByKey(rows,"Return %",true);
      }
      renderTable(sorted);
      attachSorting(rows);
      updateTimestamp();
    },
    error:(err)=>{
      tbody.innerHTML=`<tr><td colspan="5">Error loading leaderboard.</td></tr>`;
      console.error(err);
    }
  });
}

loadCSV();

/* ===========================
   Market Updates (resilient)
   =========================== */
(function (){
  const MW_RSS='https://www.marketwatch.com/rss/topstories';
  const YF_RSS='https://feeds.finance.yahoo.com/rss/2.0/headline?s=^GSPC&region=US&lang=en-US';

  const listEl=document.getElementById('news-list');
  const errEl=document.getElementById('news-error');
  const loadingEl=document.getElementById('news-loading');

  function render(items){
    if(loadingEl) loadingEl.remove();
    if(!items || !items.length){
      errEl && (errEl.style.display='block');
      listEl && (listEl.innerHTML='');
      return;
    }
    const html=items.slice(0,6).map(it=>{
      const when = it.date ? toPT(it.date) : '';
      return `
        <li style="display:flex;gap:10px;align-items:flex-start;margin:10px 0;">
          <div style="min-width:0;">
            <a target="_blank" rel="noopener" href="${it.link}" style="color:#7bb3ff;text-decoration:none;">
              ${it.title}
            </a>
            ${when?`<div style="color:#aab2bd;font-size:12px;margin-top:2px;">${when}</div>`:''}
          </div>
        </li>`;
    }).join('');
    listEl.innerHTML=html;
  }

  function withTimeout(promise,ms){
    const t=new Promise((_,rej)=>setTimeout(()=>rej(new Error('timeout')),ms));
    return Promise.race([promise,t]);
  }

  async function fetchRss2Json(url){
    const api='https://api.rss2json.com/v1/api.json?rss_url='+encodeURIComponent(url);
    const r=await withTimeout(fetch(api,{cache:'no-store'}),6000);
    if(!r.ok) throw new Error('rss2json '+r.status);
    const data=await r.json();
    if(!data || !Array.isArray(data.items)) throw new Error('rss2json bad payload');
    return data.items.map(it=>({title:it.title,link:it.link,date:it.pubDate}));
  }

  async function fetchAllOrigins(url){
    const api='https://api.allorigins.win/get?url='+encodeURIComponent(url);
    const r=await withTimeout(fetch(api,{cache:'no-store'}),6000);
    if(!r.ok) throw new Error('allorigins '+r.status);
    const {contents}=await r.json();
    const xml=new DOMParser().parseFromString(contents,'text/xml');
    const items=Array.from(xml.querySelectorAll('item'));
    if(!items.length) throw new Error('allorigins empty');
    return items.map(it=>({
      title:it.querySelector('title')?.textContent||'Untitled',
      link:it.querySelector('link')?.textContent||'#',
      date:it.querySelector('pubDate')?.textContent||''
    }));
  }

  async function loadNews(){
    try{
      render(await fetchRss2Json(MW_RSS));
      return;
    }catch(e1){
      console.warn('rss2json failed:',e1);
    }
    try{
      render(await fetchAllOrigins(MW_RSS));
      return;
    }catch(e2){
      console.warn('allorigins MW failed:',e2);
    }
    try{
      // fallback to Yahoo Finance if MarketWatch blocks proxies
      const items=await fetchAllOrigins(YF_RSS);
      render(items);
      return;
    }catch(e3){
      console.warn('allorigins YF failed:',e3);
    }
    errEl && (errEl.style.display='block');
    listEl && (listEl.innerHTML='');
  }

  if(listEl) loadNews();
})();
