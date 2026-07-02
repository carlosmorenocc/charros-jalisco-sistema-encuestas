import React from 'react'

export default function LeadThankYou() {
  return (
    <section className="thank-you">
      <h2>¡Lead registrado con éxito!</h2>
      <p>
        Gracias por registrarte en el estadio. Ya quedaste inscrito para futuras dinámicas e incentivos
        de Charros de Jalisco.
      </p>
      <div className="actions">
        <a className="btn" href="https://boletomovil.com/charros-jalisco" target="_blank" rel="noreferrer">
          Comprar boletos
        </a>
        <a className="btn btn-outline" href="https://tiendacharrosjalisco.com/" target="_blank" rel="noreferrer">
          Ir a la tienda
        </a>
      </div>
    </section>
  )
}
