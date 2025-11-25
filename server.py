import os
import logging
import asyncio
import aiohttp
import threading
import time
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import Application, CommandHandler, CallbackQueryHandler, MessageHandler, filters, ContextTypes
import yt_dlp

# ✅ TU TOKEN AQUÍ - SOLO UNA VEZ
TOKEN = "8304674517:AAHG-pU2R7ryf7gv0t1h2krWsllgCoU3sls"

# Configurar logging
logging.basicConfig(
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    level=logging.INFO
)

# Configuración de cookies
COOKIES_FILE = "cookies.txt"
PING_URL = "https://tdusllamadas.onrender.com"
PING_INTERVAL = 300  # 5 minutos en segundos

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    welcome_text = (
        "🤖 *¡Bienvenido al Bot Descargador!*\n\n"
        "Solo envíame un enlace de video y podrás:\n"
        "• 📹 Descargar video en calidad 720p\n"
        "• 🎵 Descargar solo el audio (MP3)\n\n"
        "¡Envía tu enlace y comienza!"
    )
    await update.message.reply_text(welcome_text, parse_mode='Markdown')

async def handle_url(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    url = update.message.text
    context.user_data['url'] = url

    keyboard = [
        [
            InlineKeyboardButton("🎥 Video", callback_data='video'),
            InlineKeyboardButton("🎵 Audio", callback_data='audio'),
        ]
    ]
    reply_markup = InlineKeyboardMarkup(keyboard)

    await update.message.reply_text(
        "🔗 *Enlace recibido*\n¿Qué quieres descargar?",
        reply_markup=reply_markup,
        parse_mode='Markdown'
    )

async def button_handler(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    query = update.callback_query
    await query.answer()

    choice = query.data
    url = context.user_data.get('url')

    if not url:
        await query.edit_message_text("❌ Error: No se encontró el enlace.")
        return

    await query.edit_message_text("⏳ *Descargando...* Esto puede tomar unos segundos.", parse_mode='Markdown')

    try:
        # Configuración base con cookies
        base_ydl_opts = {
            'cookiefile': COOKIES_FILE,
            'outtmpl': 'temp_%(id)s.%(ext)s',
            'quiet': True,
            'no_warnings': False,
        }

        if choice == 'video':
            # OPCIONES FLEXIBLES PARA VIDEO CON COOKIES
            ydl_opts = {
                **base_ydl_opts,
                'format': 'bestvideo[height<=720]+bestaudio/best[height<=720]/best',
                'merge_output_format': 'mp4',
            }
        else:
            # OPCIONES PARA AUDIO CON COOKIES
            ydl_opts = {
                **base_ydl_opts,
                'format': 'bestaudio/best',
                'postprocessors': [{
                    'key': 'FFmpegExtractAudio',
                    'preferredcodec': 'mp3',
                    'preferredquality': '192',
                }],
            }

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=True)
            filename = ydl.prepare_filename(info)

            if choice == 'audio':
                # Para audio, cambiamos la extensión a mp3
                filename = os.path.splitext(filename)[0] + '.mp3'

        await query.edit_message_text("📤 *Enviando archivo...*", parse_mode='Markdown')

        if choice == 'video':
            with open(filename, 'rb') as video_file:
                await context.bot.send_video(
                    chat_id=query.message.chat_id,
                    video=video_file,
                    caption="🎥 *Video descargado*",
                    parse_mode='Markdown'
                )
        else:
            with open(filename, 'rb') as audio_file:
                await context.bot.send_audio(
                    chat_id=query.message.chat_id,
                    audio=audio_file,
                    caption="🎵 *Audio descargado en MP3*",
                    parse_mode='Markdown'
                )

        # Limpiar archivo temporal
        try:
            os.remove(filename)
        except Exception as e:
            logging.warning(f"No se pudo eliminar el archivo temporal: {e}")

        await query.edit_message_text("✅ *¡Descarga completada!*", parse_mode='Markdown')

    except yt_dlp.utils.DownloadError as e:
        error_msg = f"❌ *Error de descarga:*\n\n{str(e)}\n\n💡 *Posibles soluciones:*\n• El video puede ser privado/eliminado\n• Problemas con las cookies de autenticación\n• Restricciones geográficas"
        await query.edit_message_text(error_msg, parse_mode='Markdown')
    except Exception as e:
        error_msg = f"❌ *Error inesperado:*\n\n{str(e)}"
        await query.edit_message_text(error_msg, parse_mode='Markdown')

async def invalid_message(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    await update.message.reply_text(
        "❌ Solo acepto enlaces de videos. Envía un enlace válido o usa /start",
        parse_mode='Markdown'
    )

def check_cookies_file():
    """Verifica que el archivo de cookies exista y tenga contenido"""
    if not os.path.exists(COOKIES_FILE):
        logging.error(f"❌ Archivo de cookies '{COOKIES_FILE}' no encontrado")
        return False
    
    with open(COOKIES_FILE, 'r', encoding='utf-8') as f:
        content = f.read().strip()
    
    if not content:
        logging.error(f"❌ Archivo de cookies '{COOKIES_FILE}' está vacío")
        return False
    
    logging.info(f"✅ Archivo de cookies cargado correctamente")
    return True

async def ping_server():
    """Función para hacer ping al servidor y mantenerlo activo"""
    async with aiohttp.ClientSession() as session:
        try:
            async with session.get(PING_URL) as response:
                if response.status == 200:
                    logging.info(f"✅ Ping exitoso a {PING_URL} - Servidor activo")
                else:
                    logging.warning(f"⚠️ Ping a {PING_URL} devolvió estado: {response.status}")
        except Exception as e:
            logging.error(f"❌ Error al hacer ping a {PING_URL}: {e}")

async def scheduled_ping():
    """Tarea programada para hacer ping cada 5 minutos"""
    while True:
        await ping_server()
        await asyncio.sleep(PING_INTERVAL)

def start_ping_scheduler():
    """Inicia el planificador de ping en un hilo separado"""
    def run_scheduler():
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        loop.run_until_complete(scheduled_ping())
    
    ping_thread = threading.Thread(target=run_scheduler, daemon=True)
    ping_thread.start()
    logging.info(f"🔄 Iniciado auto-ping cada {PING_INTERVAL} segundos a {PING_URL}")

def main():
    print("🤖 Iniciando bot de Telegram...")
    
    # Verificar archivo de cookies
    if not check_cookies_file():
        print("⚠️  Advertencia: No se encontró el archivo de cookies o está vacío")
        print("💡 El bot funcionará pero puede tener problemas con videos restringidos")

    # Iniciar el planificador de ping
    start_ping_scheduler()

    application = Application.builder().token(TOKEN).build()

    application.add_handler(CommandHandler("start", start))
    application.add_handler(MessageHandler(filters.TEXT & filters.Entity("url"), handle_url))
    application.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, invalid_message))
    application.add_handler(CallbackQueryHandler(button_handler))

    print("✅ Bot iniciado correctamente!")
    print(f"📁 Usando cookies de: {COOKIES_FILE}")
    print(f"🔄 Auto-ping activado cada {PING_INTERVAL} segundos a {PING_URL}")
    
    application.run_polling()

if __name__ == '__main__':
    main()