;(function () {
  var tema = 'escuro'
  try {
    var salvo = localStorage.getItem('replog_tema')
    if (salvo === 'claro' || salvo === 'escuro') tema = salvo
  } catch (e) {
  }
  var raiz = document.documentElement
  raiz.setAttribute('data-theme', tema)
  raiz.style.colorScheme = tema === 'claro' ? 'light' : 'dark'
  var meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', tema === 'claro' ? '#e9edf4' : '#0b1020')
})()
