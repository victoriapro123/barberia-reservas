let botonMostrar=document.getElementById("mostrarReserva");

let seccionReserva=document.getElementById("seccionReserva");

let boton=document.getElementById("botonReserva");

let contenedor=document.getElementById("horas");

let mensaje=document.getElementById("mensajeReserva");

let botonesServicio=document.querySelectorAll(".servicio");

let botonesDia=document.querySelectorAll(".dia");

let inputNombre=document.getElementById("nombreCliente");

let lista=document.getElementById("listaReservas");

let servicioSeleccionado="";

let diaSeleccionado="";

let reservas=JSON.parse(localStorage.getItem("reservas"))||[];

botonMostrar.addEventListener("click",function(){

seccionReserva.classList.remove("oculto");

seccionReserva.scrollIntoView({behavior:"smooth"});

});

function guardarDatos(){

localStorage.setItem("reservas",JSON.stringify(reservas));

}

function mostrarReservas(){

lista.innerHTML="";

reservas.forEach(function(reserva,index){

lista.innerHTML+=`

<p>

${reserva.texto}

<button class="cancelar"

onclick="eliminarReserva(${index})">

cancelar hora

</button>

</p>

`;

});

}

function mostrarHoras(){

if(diaSeleccionado===""){

contenedor.innerHTML="";

return;

}

contenedor.innerHTML=`

<h2>Horas disponibles</h2>

<button class="hora">10:00</button>

<button class="hora">11:00</button>

<button class="hora">12:00</button>

<button class="hora">13:00</button>

`;

let botonesHora=document.querySelectorAll(".hora");

botonesHora.forEach(function(botonHora){

let hora=botonHora.textContent;

let ocupada=reservas.find(function(r){

return r.dia===diaSeleccionado&&r.hora===hora;

});

if(ocupada){

botonHora.disabled=true;

}

botonHora.addEventListener("click",function(){

let nombreCliente=inputNombre.value.trim();

if(nombreCliente===""){

mensaje.textContent="Primero debes escribir tu nombre";

return;

}

if(servicioSeleccionado===""){

mensaje.textContent="Selecciona un servicio";

return;

}

let textoReserva=

nombreCliente+" — "+

servicioSeleccionado+" — "+

diaSeleccionado+" — "+

hora;

reservas.push({

texto:textoReserva,

dia:diaSeleccionado,

hora:hora

});

guardarDatos();

mostrarReservas();

mostrarHoras();

mensaje.textContent="Reserva realizada";

});

});

}

function eliminarReserva(indice){

reservas.splice(indice,1);

guardarDatos();

mostrarReservas();

mostrarHoras();

mensaje.textContent="Reserva cancelada";

}

botonesDia.forEach(function(botonDia){

botonDia.addEventListener("click",function(){

diaSeleccionado=botonDia.textContent;

botonesDia.forEach(function(b){

b.style.backgroundColor="#c59d5f";

b.style.color="black";

});

botonDia.style.backgroundColor="white";

botonDia.style.color="black";

mostrarHoras();

});

});

botonesServicio.forEach(function(botonServicio){

botonServicio.addEventListener("click",function(){

servicioSeleccionado=botonServicio.textContent;

botonesServicio.forEach(function(b){

b.style.backgroundColor="#c59d5f";

b.style.color="black";

});

botonServicio.style.backgroundColor="white";

botonServicio.style.color="black";

});

});

boton.addEventListener("click",function(){

mostrarHoras();

});

mostrarReservas();