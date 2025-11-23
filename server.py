import os
import logging
import asyncio
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import Application, CommandHandler, CallbackQueryHandler, MessageHandler, filters, ContextTypes
import yt_dlp

# Configuración
TOKEN = os.getenv('8304674517:AAHG-pU2R7ryf7gv0t1h2krWsllgCoU3sls')

# Configurar logging
logging.basicConfig(
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    level=logging.INFO
)

# Comando /start
async def start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    welcome_text = (
        "🤖 *¡Bienvenido al Bot Descargador!*\n\n"
        "Solo envíame un enlace de video y podrás:\n"
        "• 📹 Descargar video en calidad 720p\n"
        "• 🎵 Descargar solo el audio (MP3)\n\n"
        "¡Envía tu enlace y comienza!"
    )
    await update.message.reply_text(welcome_text, parse_mode='Markdown')

# Manejar enlaces URL
async def handle_url(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    url = update.message.text
    user_id = update.message.from_user.id
    
    # Guardar URL temporalmente
    context.user_data['url'] = url
    
    # Crear botones
    keyboard = [
        [
            InlineKeyboardButton("🎥 Video (720p)", callback_data='video'),
            InlineKeyboardButton("🎵 Audio MP3", callback_data='audio'),
        ]
    ]
    reply_markup = InlineKeyboardMarkup(keyboard)
    
    await update.message.reply_text(
        "🔗 *Enlace recibido*\n¿Qué quieres descargar?",
        reply_markup=reply_markup,
        parse_mode='Markdown'
    )

# Procesar selección del usuario
async def button_handler(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    query = update.callback_query
    await query.answer()
    
    user_id = query.from_user.id
    choice = query.data
    url = context.user_data.get('url')
    
    if not url:
        await query.edit_message_text("❌ Error: No se encontró el enlace. Envía el enlace nuevamente.")
        return
    
    await query.edit_message_text("⏳ *Descargando...* Esto puede tomar unos segundos.", parse_mode='Markdown')
    
    try:
        if choice == 'video':
            # Opciones para video 720p
            ydl_opts = {
                'format': 'best[height<=720]',
                'outtmpl': 'temp_video.%(ext)s',
            }
            file_type = "video"
        else:  # audio
            # Opciones para audio MP3
            ydl_opts = {
                'format': 'bestaudio/best',
                'outtmpl': 'temp_audio.%(ext)s',
                'postprocessors': [{
                    'key': 'FFmpegExtractAudio',
                    'preferredcodec': 'mp3',
                    'preferredquality': '192',
                }],
            }
            file_type = "audio"
        
        # Descargar con yt-dlp
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=True)
            filename = ydl.prepare_filename(info)
            
            if choice == 'audio':
                filename = 'temp_audio.mp3'
        
        await query.edit_message_text("📤 *Enviando archivo...*", parse_mode='Markdown')
        
        # Enviar archivo
        if choice == 'video':
            with open(filename, 'rb') as video_file:
                await context.bot.send_video(
                    chat_id=query.message.chat_id,
                    video=video_file,
                    caption="🎥 *Video descargado en 720p*\n¡Disfrútalo!",
                    parse_mode='Markdown'
                )
        else:
            with open(filename, 'rb') as audio_file:
                await context.bot.send_audio(
                    chat_id=query.message.chat_id,
                    audio=audio_file,
                    caption="🎵 *Audio descargado en MP3*\n¡Disfrútalo!",
                    parse_mode='Markdown'
                )
        
        # Limpiar archivo temporal
        try:
            os.remove(filename)
        except:
            pass
            
        await query.edit_message_text("✅ *¡Descarga completada!*", parse_mode='Markdown')
        
    except Exception as e:
        error_msg = f"❌ *Error al descargar:*\n{str(e)}"
        await query.edit_message_text(error_msg, parse_mode='Markdown')

# Manejar mensajes no válidos
async def invalid_message(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    await update.message.reply_text(
        "❌ *Formato no válido*\n\nSolo acepto:\n• Comando /start\n• Enlaces de videos\n\n¡Envía un enlace válido!",
        parse_mode='Markdown'
    )

# Función principal
def main():
    # Crear aplicación
    application = Application.builder().token(TOKEN).build()
    
    # Handlers
    application.add_handler(CommandHandler("start", start))
    application.add_handler(MessageHandler(filters.TEXT & filters.Entity("url"), handle_url))
    application.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, invalid_message))
    application.add_handler(CallbackQueryHandler(button_handler))
    
    # Iniciar bot
    print("🤖 Bot iniciado...")
    application.run_polling()

if __name__ == '__main__':
    main()