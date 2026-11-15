/*
 * GINT · CATÁLOGO
 * ---------------------------------------------------------------
 * Aquí se define todo lo que aparece en el menú. No hace falta tocar
 * ningún otro archivo para añadir series, temporadas o episodios.
 *
 * Cada episodio necesita el enlace de Google Drive del capítulo.
 * Sirve cualquier enlace de archivo:
 *
 *   https://drive.google.com/file/d/1ZiHyeXTJ_jTqHoIUIH_gMmQxHVhN0J5f/view?usp=drive_link
 *
 * También puedes pegar sólo el ID (1ZiHyeXTJ_jTqHoIUIH_gMmQxHVhN0J5f).
 * Da igual de cuál de las tres cuentas venga el archivo: lo único
 * importante es que tanto la carpeta como los archivos estén
 * compartidos como "Cualquier persona con el enlace" (Lector),
 * porque el reproductor entra sin iniciar sesión.
 *
 * Carpetas de las tres temporadas (referencia):
 *   Temporada 1: https://drive.google.com/drive/folders/135fgSXbXNnnMy7pR1kXY5MOz3xhpFJJF
 *   Temporada 2: https://drive.google.com/drive/folders/1toT8dJlpGUFd-ViX8px11Jl2pHpRDFgn
 *   Temporada 3: https://drive.google.com/drive/folders/1u0YxUaWVpbmq2onDB-m393tLuJ8wX2dP
 *
 * Campos de un episodio:
 *   number    número del episodio                        (obligatorio)
 *   title     título visible                             (opcional)
 *   driveId   enlace o ID de Google Drive                (obligatorio para reproducir)
 *   duration  duración a mostrar, ej. "24 min"           (opcional)
 *   drive     cuenta que lo aloja, ej. "Gintama111111111" (opcional, informativo)
 *   thumb     URL de miniatura propia                    (opcional)
 *
 * Ejemplo de un episodio completo:
 *
 *   { number: 1, title: "Episodio 1", duration: "24 min",
 *     drive: "Gintama111111111",
 *     driveId: "https://drive.google.com/file/d/1ZiHyeXTJ_jTqHoIUIH_gMmQxHVhN0J5f/view?usp=drive_link" }
 *
 * Si un episodio se queda sin driveId, aparece como "Sin enlace"
 * y no se puede reproducir (así puedes ir rellenando poco a poco).
 * ---------------------------------------------------------------
 */

window.GINT_CATALOG = {
  series: [
    {
      id: "gintama",
      title: "Gintama",
      year: 2006,
      synopsis:
        "Edo, una época en la que los samuráis perdieron sus espadas ante los invasores Amanto. " +
        "Gintoki, un samurái de pelo plateado, sobrevive haciendo encargos de todo tipo junto a " +
        "Shinpachi y Kagura en una casa que no es exactamente un salón de té.",
      cover: "",
      seasons: [
        {
          number: 1,
          title: "Temporada 1",
          episodes: []
        },
        {
          number: 2,
          title: "Temporada 2",
          episodes: []
        },
        {
          number: 3,
          title: "Temporada 3",
          episodes: []
        }
      ]
    }
  ]
};
