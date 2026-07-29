import React, { useEffect } from 'react'
import logo from '../assets/logo.png'
import styles from './FormsPaused.module.css'

export default function FormsPaused() {
  useEffect(() => {
    const previousTitle = document.title
    document.title = 'Registro temporalmente no disponible | Charros de Jalisco'
    return () => {
      document.title = previousTitle
    }
  }, [])

  return (
    <main className={styles.page}>
      <section className={styles.card} aria-labelledby="paused-title">
        <img src={logo} alt="Charros de Jalisco" />
        <span className={styles.eyebrow}>Sistema oficial</span>
        <h1 id="paused-title">Registro temporalmente no disponible</h1>
        <p>
          Estamos reforzando la seguridad de esta plataforma.
          Por el momento no se reciben registros ni respuestas.
        </p>
        <div className={styles.status}>
          <span aria-hidden="true" />
          Acceso público deshabilitado
        </div>
      </section>
    </main>
  )
}
