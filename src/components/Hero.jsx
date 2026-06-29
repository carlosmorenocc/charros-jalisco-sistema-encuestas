import React, { useState } from 'react'

export default function Hero(){
  const [copied, setCopied] = useState(false)

  const shareLink = async () => {
    const url = typeof window !== 'undefined' ? window.location.href : 'https://charrosjalisco.com'

    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Encuesta Oficial Charros 2026-2027',
          text: 'Comparte esta encuesta con la afición Charros.',
          url
        })
        return
      } catch (error) {
        console.warn('Share cancelled', error)
      }
    }

    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (error) {
      console.warn('Unable to copy link', error)
    }
  }

  return (
    <header className="hero">
      <div className="hero-inner">
        <img src="/assets/ch-logo.png" alt="Charros logo" className="logo" />
        <h1>Encuesta Oficial Charros 2026-2027</h1>
        <p className="slogan">Únete al Club más Charro</p>
        <p style={{maxWidth:700,margin:'8px auto 0'}}>En Charros de Jalisco queremos seguir construyendo una experiencia a la altura de nuestra afición. Responde esta breve encuesta y ayúdanos a mejorar tu visita al estadio, conocer tus intereses y enviarte promociones, preventas y beneficios pensados para ti.</p>

        <div style={{display:'flex',gap:12,justifyContent:'center',marginTop:12,flexWrap:'wrap'}}>
          <button type="button" className="btn btn-outline" onClick={shareLink}>
            {copied ? 'Enlace copiado' : 'Compartir enlace'}
          </button>
          <div style={{textAlign:'center'}}>
            <strong>Encuesta rápida</strong>
            <div>3 minutos</div>
          </div>
          <div style={{textAlign:'center'}}>
            <strong>Tu opinión</strong>
            <div>mejora la experiencia</div>
          </div>
          <div style={{textAlign:'center'}}>
            <strong>Promociones</strong>
            <div>y beneficios</div>
          </div>
        </div>
      </div>
    </header>
  )
}
