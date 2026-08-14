export function parseOfficialCsv(text='') {
  const rows=[];let row=[],cell='',quoted=false;
  for(let index=0;index<text.length;index++){const char=text[index];if(char==='"'){if(quoted&&text[index+1]==='"'){cell+='"';index++;}else quoted=!quoted;}else if(char===','&&!quoted){row.push(cell);cell='';}else if((char==='\n'||char==='\r')&&!quoted){if(char==='\r'&&text[index+1]==='\n')index++;row.push(cell);if(row.some(value=>value!==''))rows.push(row);row=[];cell='';}else cell+=char;}
  if(cell||row.length){row.push(cell);rows.push(row);}if(rows.length<2)return[];
  const headers=rows[0].map((header,index)=>index===0?header.replace(/^\uFEFF/,'').trim():header.trim());
  return rows.slice(1).map(values=>Object.fromEntries(headers.map((header,index)=>[header,values[index]??''])));
}
