import React from 'react'
import Hero from './components/Hero'
import MultiStepForm from './components/MultiStepForm'

export default function App() {
  return (
    <div className="app-root">
      <Hero />

      <main className="container">
        <MultiStepForm />
      </main>

      <footer className="site-footer" style={{textAlign:'center',padding:12}}>
        <small>
          Aviso de privacidad: <a href="https://www.charrosjalisco.com/aviso-de-privacidad" target="_blank">Ver documento</a>
        </small>
      </footer>
    </div>
  )
}
