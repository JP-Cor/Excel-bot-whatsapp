function actualizarProgreso(porcentaje, texto) {
  const barra = document.getElementById('barraProgreso');
  const textoProgreso = document.getElementById('textoProgreso');

  if (!barra || !textoProgreso) return;

  barra.style.width = `${porcentaje}%`;
  barra.textContent = `${porcentaje}%`;
  textoProgreso.textContent = texto;

  if (porcentaje >= 100) {
    barra.classList.remove('progress-bar-animated');
    barra.classList.add('bg-success');
  } else {
    barra.classList.add('progress-bar-animated');
    barra.classList.remove('bg-success');
  }
}

function reiniciarProgreso() {
  actualizarProgreso(0, 'Esperando envío...');
}

function descargarPlantilla() {
  window.open('/api/descargar-plantilla', '_blank');
}

async function subirExcel() {
  const input = document.getElementById('archivoExcel');
  const estado = document.getElementById('estadoExcel');

  if (!input || !input.files || input.files.length === 0) {
    estado.innerHTML = '<span class="text-danger">Selecciona un archivo Excel primero.</span>';
    return;
  }

  const archivo = input.files[0];
  const formData = new FormData();
  formData.append('excel', archivo);

  try {
    estado.innerHTML = '<span class="text-primary">Subiendo archivo...</span>';

    const respuesta = await fetch('/api/subir-excel', {
      method: 'POST',
      body: formData
    });

    const data = await respuesta.json();

    if (!respuesta.ok) {
      estado.innerHTML = `<span class="text-danger">${data.error || 'No se pudo subir el archivo'}</span>`;
      return;
    }

    estado.innerHTML = '<span class="text-success">Excel cargado correctamente.</span>';
    await cargarClientes();
    input.value = '';
  } catch (error) {
    console.error('Error subiendo Excel:', error);
    estado.innerHTML = '<span class="text-danger">Error al subir el archivo.</span>';
  }
}

async function cargarClientes() {
  try {
    const respuesta = await fetch('/api/clientes');
    const datos = await respuesta.json();

    const encabezado = document.getElementById('encabezado');
    const cuerpoTabla = document.getElementById('cuerpoTabla');

    if (!encabezado || !cuerpoTabla) return;

    encabezado.innerHTML = '';
    cuerpoTabla.innerHTML = '';

    await cargarEstadoWhatsapp();

    if (!Array.isArray(datos) || datos.length === 0) {
      cuerpoTabla.innerHTML = `
        <tr>
          <td colspan="100%" class="text-center">No hay datos en el Excel</td>
        </tr>
      `;
      return;
    }

    const columnas = Object.keys(datos[0]);

    columnas.forEach((columna) => {
      encabezado.innerHTML += `<th>${columna}</th>`;
    });

    encabezado.innerHTML += `<th>Acciones</th>`;

    datos.forEach((cliente) => {
      const estado = String(cliente.Estado || '').toLowerCase();
      const claseFila = estado === 'enviado' ? 'table-success' : '';

      let fila = `<tr class="${claseFila}">`;

      columnas.forEach((columna) => {
        fila += `<td>${cliente[columna] ?? ''}</td>`;
      });

      fila += `
        <td class="d-flex gap-2 flex-wrap">
          
          <button class="btn btn-success btn-sm" onclick='enviarAutomatico(${JSON.stringify(cliente)}, false)'>
            Enviar automático
          </button>
        </td>
      `;

      fila += `</tr>`;
      cuerpoTabla.innerHTML += fila;
    });
  } catch (error) {
    console.error('Error al cargar clientes:', error);
    alert('Error al cargar clientes');
  }
}

async function cargarEstadoWhatsapp() {
  try {
    const respuesta = await fetch('/api/whatsapp-status');
    const data = await respuesta.json();

    const estadoWhatsapp = document.getElementById('estadoWhatsapp');
    if (!estadoWhatsapp) return;

    estadoWhatsapp.innerHTML = data.ready
      ? `<span class="badge bg-success">WhatsApp conectado</span>`
      : `<span class="badge bg-warning text-dark">WhatsApp no conectado</span>`;
  } catch (error) {
    console.error('Error consultando estado de WhatsApp:', error);
  }
}

async function marcarEnviado(cliente) {
  try {
    const respuesta = await fetch('/api/marcar-enviado', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cliente)
    });

    const data = await respuesta.json();

    if (!respuesta.ok) {
      alert(data.error || 'No se pudo marcar como enviado');
      return;
    }

    alert('✅ Marcado como enviado');
    await cargarClientes();
  } catch (error) {
    console.error('Error al marcar enviado:', error);
    alert('Error al marcar enviado');
  }
}

async function enviarAutomatico(cliente, modoMasivo = false) {
  const mensajeInput = document.getElementById('mensajePersonalizado');
  const imagenInput = document.getElementById('archivoImagen');
  const pdfInput = document.getElementById('archivoPdf');

  const mensaje = mensajeInput ? mensajeInput.value : '';
  const imagen = imagenInput && imagenInput.files.length > 0 ? imagenInput.files[0] : null;
  const pdf = pdfInput && pdfInput.files.length > 0 ? pdfInput.files[0] : null;

  const formData = new FormData();
  formData.append('Nombre', cliente.Nombre || '');
  formData.append('Servicio', cliente.Servicio || '');
  formData.append('Contacto', cliente.Contacto || '');
  formData.append('mensaje', mensaje);

  if (imagen) formData.append('imagen', imagen);
  if (pdf) formData.append('pdf', pdf);

  if (!modoMasivo) {
    const confirmar = confirm(
      `¿Enviar a ${cliente.Nombre || ''}?\n\n` +
      `Mensaje: ${mensaje ? 'Sí' : 'No'}\n` +
      `Imagen: ${imagen ? 'Sí' : 'No'}\n` +
      `PDF: ${pdf ? 'Sí' : 'No'}`
    );

    if (!confirmar) return false;
  }

  try {
    const respuesta = await fetch('/api/enviar-automatico', {
      method: 'POST',
      body: formData
    });

    const data = await respuesta.json();

    if (!respuesta.ok) {
      console.error('Error al enviar:', data.error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error al enviar automático:', error);
    return false;
  }
}

function esperaAleatoria(minMin = 2, maxMin = 7) {
  const minutos = Math.floor(Math.random() * (maxMin - minMin + 1)) + minMin;
  const milisegundos = minutos * 60 * 1000;

  actualizarProgreso(0, `Esperando ${minutos} minutos antes del siguiente envío...`);
  console.log(`Esperando ${minutos} minutos...`);

  return new Promise(resolve => setTimeout(resolve, milisegundos));
}

async function enviarTodos() {
  try {
    const respuesta = await fetch('/api/clientes');
    const clientes = await respuesta.json();

    const pendientes = clientes.filter(cliente =>
      String(cliente.Estado || '').toLowerCase() !== 'enviado'
    );

    if (pendientes.length === 0) {
      alert('No hay clientes pendientes');
      return;
    }

    const confirmar = confirm(`Se enviarán ${pendientes.length} clientes pendientes. ¿Continuar?`);
    if (!confirmar) return;

    for (let i = 0; i < pendientes.length; i++) {
      const cliente = pendientes[i];

      const porcentaje = Math.floor((i / pendientes.length) * 100);
      actualizarProgreso(porcentaje, `Enviando a ${cliente.Nombre || ''} (${i + 1} de ${pendientes.length})`);

      const enviado = await enviarAutomatico(cliente, true);

      if (!enviado) {
        console.error(`Falló envío a ${cliente.Nombre}`);
      }

      await cargarClientes();

      if (i < pendientes.length - 1) {
        await esperaAleatoria(2, 7);
      }
    }

    actualizarProgreso(100, 'Todos los envíos completados ✅');
    alert('Proceso masivo terminado');
  } catch (error) {
    console.error('Error en envío masivo:', error);
    alert('Error en envío masivo');
  }
}

window.addEventListener('load', () => {
  reiniciarProgreso();

  const inputExcel = document.getElementById('archivoExcel');
  if (inputExcel) {
    inputExcel.addEventListener('change', async () => {
      await subirExcel();
    });
  }

  cargarClientes();
});