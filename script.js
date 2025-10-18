// Google Sheets
function toPT(dateStr){
  if(!dateStr) return "";
  const dt=new Date(dateStr);
  dt.setHours(dt.getHours()-3);
  return new Intl.DateTimeFormat("en-US",{timeZone:"America/Los_Angeles",year:"numeric",month:"short",day:"numeric",hour:"numeric",minute:"2-digit",hour12:true}).format(dt)+" PT";
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
