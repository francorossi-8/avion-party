/* Palabras compartidas: las usan "Dibujá y adiviná" y "Teléfono descompuesto".
   Para sumar palabras, agregalas a la lista que corresponda (las repetidas se ignoran solas). */
(function () {
  'use strict';
  var GRUPOS = {
    animales: ['perro', 'gato', 'pez', 'pájaro', 'serpiente', 'tortuga', 'conejo', 'elefante', 'jirafa', 'león', 'mono', 'pingüino',
      'tiburón', 'pulpo', 'araña', 'mariposa', 'abeja', 'caracol', 'vaca', 'chancho', 'caballo', 'oveja', 'gallina', 'pato', 'búho',
      'ratón', 'ballena', 'cangrejo', 'estrella de mar', 'murciélago', 'zorro', 'lobo', 'oso', 'oso panda', 'koala', 'canguro', 'cebra',
      'rinoceronte', 'hipopótamo', 'cocodrilo', 'camello', 'llama', 'ciervo', 'ardilla', 'erizo', 'mapache', 'castor', 'foca', 'delfín',
      'medusa', 'caballito de mar', 'langosta', 'camarón', 'mosquito', 'hormiga', 'mosca', 'grillo', 'vaquita de San Antonio', 'lombriz',
      'rana', 'lagartija', 'camaleón', 'flamenco', 'pavo real', 'loro', 'tucán', 'águila', 'cuervo', 'paloma', 'gaviota', 'cisne',
      'avestruz', 'colibrí', 'cóndor', 'gorila', 'perezoso', 'hámster', 'burro', 'cabra', 'gallo', 'pollito', 'dinosaurio', 'mamut',
      'unicornio', 'tigre', 'carpincho', 'zorrino', 'perro salchicha', 'oruga', 'libélula', 'cucaracha', 'escorpión', 'pez espada',
      'pez globo', 'morsa', 'pulga', 'gusano', 'jabalí', 'nutria', 'lechuza', 'tero', 'yacaré', 'mulita'],
    comida: ['mate', 'pizza', 'helado', 'manzana', 'banana', 'uva', 'sandía', 'zanahoria', 'huevo', 'torta', 'empanada', 'asado',
      'hamburguesa', 'pochoclo', 'sushi', 'taco', 'café', 'alfajor', 'medialuna', 'choripán', 'milanesa', 'ñoquis', 'fideos',
      'dulce de leche', 'queso', 'jamón', 'salchicha', 'pancho', 'papas fritas', 'panqueque', 'tostada', 'sándwich', 'pan', 'galletita',
      'chupetín', 'caramelo', 'chocolate', 'chicle', 'dona', 'flan', 'gelatina', 'palta', 'tomate', 'lechuga', 'cebolla', 'ajo', 'choclo',
      'papa', 'berenjena', 'morrón', 'pepino', 'brócoli', 'frutilla', 'cereza', 'pera', 'naranja', 'limón', 'ananá', 'coco', 'kiwi',
      'durazno', 'maní', 'nuez', 'aceituna', 'huevo frito', 'pollo asado', 'ravioles', 'sopa', 'ensalada', 'licuado', 'jugo', 'vino',
      'cerveza', 'té', 'leche', 'torta de cumpleaños', 'churro', 'provoleta', 'salame', 'bife', 'mermelada', 'pochoclera', 'chipá',
      'tarta', 'pastafrola', 'garrapiñada', 'mandarina', 'arvejas', 'zapallo', 'hielo', 'cucurucho', 'pizza con ananá', 'fernet'],
    casa: ['casa', 'llave', 'candado', 'puerta', 'ventana', 'escalera', 'cama', 'silla', 'mesa', 'lámpara', 'televisor', 'teléfono',
      'computadora', 'libro', 'lápiz', 'tijera', 'martillo', 'clavo', 'escoba', 'balde', 'inodoro', 'ducha', 'cepillo', 'peine', 'espejo',
      'reloj', 'vela', 'botella', 'copa', 'tenedor', 'cuchara', 'olla', 'heladera', 'lavarropas', 'ventilador', 'termo', 'sillón',
      'almohada', 'frazada', 'alfombra', 'cortina', 'enchufe', 'lamparita', 'linterna', 'fósforo', 'encendedor', 'despertador',
      'calendario', 'cuadro', 'florero', 'maceta', 'regadera', 'manguera', 'cortadora de pasto', 'pala', 'rastrillo', 'carretilla',
      'serrucho', 'destornillador', 'tornillo', 'taladro', 'pincel', 'esponja', 'jabón', 'toalla', 'pasta de dientes',
      'cepillo de dientes', 'secador de pelo', 'plancha', 'percha', 'ropero', 'microondas', 'horno', 'tostadora', 'licuadora', 'pava',
      'sartén', 'cuchillo', 'plato', 'taza', 'vaso', 'jarra', 'sacacorchos', 'rallador', 'palillos chinos', 'escritorio', 'sobre',
      'estampilla', 'buzón', 'timbre', 'billetera', 'moneda', 'billete', 'alcancía', 'caja fuerte', 'imán', 'pila', 'control remoto',
      'teclado', 'impresora', 'celular', 'parlante', 'radio', 'antena', 'joystick', 'lupa', 'cuaderno', 'regla', 'goma de borrar',
      'sacapuntas', 'abrochadora', 'clip', 'calculadora', 'pizarrón', 'globo terráqueo', 'bañera', 'canilla', 'bombilla', 'cajón', 'cuna', 'chimenea', 'tetera', 'hamaca paraguaya', 'trampa para ratones', 'aspiradora'],
    ropa: ['anteojos', 'paraguas', 'zapato', 'remera', 'sombrero', 'corona', 'mochila', 'bufanda', 'guantes', 'gorro', 'gorra', 'campera',
      'pantalón', 'pollera', 'vestido', 'corbata', 'moño', 'medias', 'zapatillas', 'ojotas', 'botas', 'pantuflas', 'pijama', 'malla',
      'cinturón', 'cartera', 'collar', 'anillo', 'aros', 'pulsera', 'peluca', 'máscara', 'capa', 'casco', 'abanico', 'bastón',
      'anteojos de sol', 'galera', 'poncho', 'boina', 'delantal', 'traje de baño', 'tacos', 'kimono', 'bata', 'tutú'],
    transporte: ['avión', 'auto', 'barco', 'bicicleta', 'tren', 'cohete', 'paracaídas', 'helicóptero', 'submarino', 'tractor',
      'ambulancia', 'colectivo', 'moto', 'patineta', 'taxi', 'camión', 'camión de bomberos', 'patrullero', 'grúa', 'excavadora', 'subte',
      'tranvía', 'teleférico', 'globo aerostático', 'velero', 'canoa', 'lancha', 'crucero', 'balsa', 'monopatín', 'patines', 'trineo',
      'carruaje', 'ovni', 'nave espacial', 'rueda', 'volante', 'changuito', 'avioneta', 'kayak', 'auto de carrera',
      'camioneta', 'tanque de guerra', 'casa rodante', 'bote inflable'],
    viaje: ['valija', 'pasaporte', 'mapa', 'brújula', 'carpa', 'fogata', 'aeropuerto', 'azafata', 'piloto', 'torre de control',
      'cinturón de seguridad', 'ventanilla', 'turbulencia', 'bolsa de dormir', 'binoculares', 'cantimplora', 'postal', 'souvenir',
      'cámara de fotos', 'selfie', 'hotel', 'mapa del tesoro', 'pasaje', 'escalera del avión', 'cinta de equipaje',
      'almohada de viaje', 'free shop', 'migraciones', 'protector solar', 'sombrilla', 'reposera', 'castillo de arena'],
    lugares: ['isla', 'volcán', 'castillo', 'faro', 'puente', 'semáforo', 'playa', 'montaña', 'escuela', 'hospital', 'iglesia', 'pirámide',
      'iglú', 'rascacielos', 'torre Eiffel', 'obelisco', 'molino', 'granja', 'cárcel', 'plaza', 'hamaca', 'tobogán', 'subibaja',
      'calesita', 'montaña rusa', 'circo', 'zoológico', 'acuario', 'museo', 'cine', 'teatro', 'estadio', 'pileta', 'cancha de fútbol',
      'supermercado', 'kiosco', 'panadería', 'farmacia', 'puerto', 'muelle', 'cueva', 'desierto', 'selva', 'bosque', 'cascada', 'río',
      'lago', 'oasis', 'glaciar', 'cementerio', 'casa embrujada', 'casita del árbol', 'parque de diversiones', 'estación de servicio',
      'peluquería', 'biblioteca', 'ascensor', 'escalera mecánica', 'laberinto', 'Estatua de la Libertad', 'muralla china', 'Coliseo'],
    naturaleza: ['sol', 'luna', 'árbol', 'flor', 'estrella', 'nube', 'lluvia', 'rayo', 'arcoíris', 'cactus', 'hongo', 'nieve', 'tornado',
      'ola', 'palmera', 'hoja', 'pasto', 'rosa', 'girasol', 'calabaza', 'tormenta', 'viento', 'terremoto', 'planeta', 'Saturno',
      'estrella fugaz', 'eclipse', 'agujero negro', 'atardecer', 'cubito de hielo', 'fuego', 'humo', 'piedra', 'arena', 'coral', 'alga',
      'tronco', 'rama', 'raíz', 'semilla', 'trébol', 'margarita', 'tulipán', 'bonsái', 'pino', 'árbol de Navidad', 'nido', 'telaraña',
      'huella', 'charco', 'barrilete', 'luna llena', 'niebla', 'granizo', 'iceberg', 'meteorito', 'ola gigante', 'flor carnívora'],
    personajes: ['payaso', 'pirata', 'rey', 'bruja', 'hada', 'ángel', 'diablo', 'muñeco de nieve', 'robot', 'extraterrestre', 'fantasma',
      'dragón', 'bombero', 'policía', 'médico', 'enfermera', 'cocinero', 'peluquero', 'dentista', 'maestra', 'cartero', 'astronauta',
      'buzo', 'jardinero', 'carpintero', 'pintor', 'fotógrafo', 'mago', 'malabarista', 'cantante', 'bailarina', 'futbolista', 'arquero',
      'boxeador', 'árbitro', 'granjero', 'pescador', 'leñador', 'minero', 'científico', 'detective', 'espía', 'ladrón', 'juez',
      'princesa', 'príncipe', 'caballero', 'vikingo', 'ninja', 'samurái', 'vaquero', 'gaucho', 'momia', 'vampiro', 'zombi',
      'hombre lobo', 'sirena', 'duende', 'gnomo', 'gigante', 'cíclope', 'Papá Noel', 'superhéroe', 'bebé', 'abuelo', 'novios',
      'esqueleto', 'espantapájaros', 'marioneta', 'títere', 'osito de peluche', 'muñeca', 'chef', 'salvavidas', 'guardia', 'DJ',
      'hombre invisible', 'mimo', 'cavernícola', 'rey mago', 'Frankenstein'],
    juegos: ['pelota', 'arco', 'ajedrez', 'dado', 'carta', 'trofeo', 'medalla', 'fútbol', 'tenis', 'básquet', 'vóley', 'rugby', 'golf',
      'bowling', 'ping pong', 'surf', 'esquí', 'dominó', 'rompecabezas', 'cubo mágico', 'yoyó', 'trompo', 'burbujas', 'pistola de agua',
      'metegol', 'pelota de playa', 'dardos', 'arco y flecha', 'bate de béisbol', 'raqueta', 'pesas', 'podio', 'silbato', 'cronómetro',
      'botines', 'globo de agua', 'bolita', 'soga de saltar', 'rayuela', 'escondidas', 'tatetí', 'piñata', 'videojuego', 'karaoke'],
    musica: ['guitarra', 'batería', 'piano', 'trompeta', 'micrófono', 'auriculares', 'campana', 'violín', 'bandoneón', 'flauta', 'saxofón',
      'arpa', 'tambor', 'maracas', 'nota musical', 'bombo', 'tango', 'disco', 'concierto', 'pandereta', 'acordeón', 'tocadiscos'],
    cuerpo: ['corazón', 'calavera', 'ojo', 'nariz', 'boca', 'oreja', 'mano', 'pie', 'diente', 'bigote', 'barba', 'cerebro', 'músculo',
      'lengua', 'huella digital', 'beso', 'abrazo', 'lágrima', 'sonrisa', 'pelado', 'trenza', 'rulos', 'ombligo', 'codo', 'rodilla',
      'esqueleto de dinosaurio', 'tatuaje', 'ojo morado', 'diente flojo', 'pestañas'],
    acciones: ['nadar', 'bailar', 'correr', 'saltar', 'dormir', 'llorar', 'pescar', 'cocinar', 'volar', 'escalar', 'manejar', 'leer',
      'pintar', 'cantar', 'aplaudir', 'saludar', 'patear', 'barrer', 'regar', 'cavar', 'tomar mate', 'sacar una foto', 'estornudar',
      'bostezar', 'roncar', 'hacer fila', 'tejer', 'malabarear', 'meditar', 'surfear', 'hacer la vertical', 'pedir un deseo',
      'tirarse de cabeza', 'hacer un pozo', 'perder el avión', 'hacer asado', 'tocar timbre y correr'],
    cosas: ['regalo', 'globo', 'bandera', 'reloj de arena', 'ancla', 'cámara', 'mapa', 'fuegos artificiales', 'brindis', 'huevo de Pascua',
      'bola de cristal', 'lámpara mágica', 'alfombra voladora', 'cofre del tesoro', 'botella con mensaje', 'isla desierta', 'barco pirata',
      'espada', 'escudo', 'catapulta', 'cañón', 'bomba', 'dinamita', 'bola de nieve', 'reloj cucú', 'candelabro', 'trono', 'pergamino',
      'poción', 'caldero', 'varita mágica', 'dron', 'robot aspiradora', 'cargador', 'wifi', 'termómetro', 'jeringa', 'pastilla', 'curita',
      'estetoscopio', 'silla de ruedas', 'muletas', 'telescopio', 'microscopio', 'tubo de ensayo', 'ataúd', 'herradura', 'diamante', 'cofre', 'llave maestra', 'cartel de pare', 'carretel', 'escalera de mano',
      'jaula', 'correa de perro', 'hueso', 'pecera', 'tesoro', 'torre de cartas', 'sello']
  };
  var todas = [], vistas = {};
  Object.keys(GRUPOS).forEach(function (g) {
    GRUPOS[g].forEach(function (w) {
      var k = w.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
      if (vistas[k]) return;
      vistas[k] = 1;
      todas.push(w);
    });
  });

  // Ideas para arrancar el Teléfono descompuesto: sujeto + situación (más de 1.500 combinaciones)
  var SUJETOS = ['un pingüino', 'una abuela', 'un dinosaurio', 'un astronauta', 'un perro salchicha', 'un pulpo', 'una vaca', 'un robot',
    'un fantasma', 'un carpincho', 'una sirena', 'un vampiro', 'un gaucho', 'un bebé', 'un cocodrilo', 'un mago', 'un pirata', 'una jirafa',
    'un oso panda', 'un ninja', 'un zombi', 'una bruja', 'un unicornio', 'un elefante', 'un tiburón', 'un caracol', 'un payaso', 'un rey',
    'una gallina', 'un extraterrestre', 'una momia', 'un bombero', 'una azafata', 'un piloto', 'un gato', 'un mono', 'una hormiga gigante',
    'un muñeco de nieve', 'un esqueleto', 'Papá Noel'];
  var SITUACIONES = ['tomando mate', 'haciendo un asado', 'manejando un colectivo', 'bailando tango', 'perdido en el aeropuerto',
    'jugando al fútbol', 'durmiendo en una hamaca', 'comiendo una pizza gigante', 'surfeando una ola', 'escalando una montaña',
    'tocando la guitarra', 'leyendo el diario', 'pescando en un lago', 'remontando un barrilete', 'sacándose una selfie',
    'esquiando en la nieve', 'cocinando fideos', 'en la cima de un volcán', 'adentro de una valija', 'arriba de un camello',
    'andando en monopatín', 'con anteojos de sol en la playa', 'haciendo malabares', 'escapando de una abeja', 'cantando en un karaoke',
    'en una montaña rusa', 'manejando un avión', 'abrazando un árbol', 'haciendo fila en el banco', 'regando las plantas',
    'pintando un cuadro', 'con paraguas bajo la lluvia', 'jugando al ajedrez', 'en una bañera llena de espuma', 'empujando un changuito',
    'con disfraz de fantasma', 'tirándose en paracaídas', 'buscando un tesoro', 'en un ascensor trabado', 'festejando un gol',
    'en una pileta con flotador', 'haciendo yoga', 'paseando perros', 'atendiendo un kiosco', 'en la luna', 'arriba de un tractor',
    'con turbulencia en el avión', 'peleando con una gaviota', 'vendiendo helados', 'dando una clase'];

  window.PALABRAS = {
    dibujar: todas,
    grupos: GRUPOS,
    idea: function () {
      return SUJETOS[(Math.random() * SUJETOS.length) | 0] + ' ' + SITUACIONES[(Math.random() * SITUACIONES.length) | 0];
    }
  };
})();
