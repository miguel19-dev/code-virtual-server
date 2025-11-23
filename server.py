import os
import logging
import asyncio
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import Application, CommandHandler, CallbackQueryHandler, MessageHandler, filters, ContextTypes
import yt_dlp

# ⚠️ REEMPLAZA ESTE TOKEN CON EL TUYO ⚠️
TOKEN = "8304674517:AAHG-pU2R7ryf7gv0t1h2krWsllgCoU3sls"  # 👈 Pega tu token aquí

# Configurar logging
logging.basicConfig(
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    level=logging.INFO
)

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
        if choice == 'video':
            # OPCIONES MÁS FLEXIBLES PARA VIDEO
            ydl_opts = {
                'format': 'best[height<=720]/best[height<=480]/best',
                'outtmpl': 'temp_video.%(ext)s',
            }
        else:
            # OPCIONES PARA AUDIO
            ydl_opts = {
                'format': 'bestaudio/best',
                'outtmpl': 'temp_audio.%(ext)s',
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
                filename = 'temp_audio.mp3'
        
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
        
        # Limpiar archivo
        try:
            os.remove(filename)
        except:
            pass
            
        await query.edit_message_text("✅ *¡Descarga completada!*", parse_mode='Markdown')
        
    except Exception as e:
        error_msg = f"❌ *Error al descargar:*\n\n{str(e)}\n\n💡 *Posibles soluciones:*\n• El video puede ser privado\n• El enlace puede ser incorrecto\n• La plataforma no está soportada"
        await query.edit_message_text(error_msg, parse_mode='Markdown')

async def invalid_message(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    await update.message.reply_text(
        "❌ Solo acepto enlaces de videos. Envía un enlace válido o usa /start",
        parse_mode='Markdown'
    )

def main():
    print("🤖 Iniciando bot de Telegram...")
    
    # Verificar que el token no sea el placeholder
    if TOKEN == "8304674517:AAHG-pU2R7ryf7gv0t1h2krWsllgCoU3sls":
        print("❌ ERROR: Debes reemplazar 'TU_TOKEN_AQUI' con tu token real")
        print("💡 Obtén tu token de @BotFather en Telegram")
        return
    
    application = Application.builder().token(TOKEN).build()
    
    application.add_handler(CommandHandler("start", start))
    application.add_handler(MessageHandler(filters.TEXT & filters.Entity("url"), handle_url))
    application.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, invalid_message))
    application.add_handler(CallbackQueryHandler(button_handler))
    
    print("✅ Bot iniciado correctamente!")
    application.run_polling()

if __name__ == '__main__':
    main()