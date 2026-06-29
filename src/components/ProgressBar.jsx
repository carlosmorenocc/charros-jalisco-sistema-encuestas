import React from 'react'

export default function ProgressBar({ current, total }){
  const pct = Math.round((current/total)*100)
  return (
    <div style={{marginBottom:12}}>
      <div style={{height:8,background:'#eee',borderRadius:8,overflow:'hidden'}}>
        <div style={{width:`${pct}%`,height:'100%',background:'var(--blue)'}} />
      </div>
      <div style={{fontSize:12,marginTop:6}}>{current} de {total}</div>
    </div>
  )
}
