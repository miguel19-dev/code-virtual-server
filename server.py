import os
import logging
import asyncio
from telegram import Update
from telegram.ext import Application, MessageHandler, filters, ContextTypes
import yt_dlp

# ✅ TU TOKEN AQUÍ
TOKEN = "8304674517:AAHG-pU2R7ryf7gv0t1h2krWsllgCoU3sls"

# Configurar logging
logging.basicConfig(
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    level=logging.INFO
)

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    welcome_text = (
        "🎥 *Bot Convertidor de Videos a 360p*\n\n"
        "Solo envíame un video y lo convertiré a calidad 360p optimizada.\n\n"
        "⚡ *Características:*\n"
        "• Reducción de tamaño manteniendo buena calidad\n"
        "• Conversión rápida y eficiente\n"
        "• Compatible con la mayoría de formatos\n\n"
        "¡Envía un video para comenzar!"
    )
    await update.message.reply_text(welcome_text, parse_mode='Markdown')

async def handle_video(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Maneja videos enviados directamente al bot"""
    
    # Verificar si el mensaje contiene un video
    if not update.message.video:
        await update.message.reply_text("❌ Por favor, envía un video válido.")
        return

    video = update.message.video
    await update.message.reply_text("⏳ *Procesando video...*\nConvirtiendo a 360p...", parse_mode='Markdown')

    try:
        # Descargar el video
        file_id = video.file_id
        file = await context.bot.get_file(file_id)
        
        # Nombre del archivo temporal
        temp_input = f"temp_input_{file_id}.mp4"
        temp_output = f"temp_output_{file_id}.mp4"
        
        # Descargar el archivo
        await file.download_to_drive(temp_input)

        # Configuración para convertir a 360p
        ydl_opts = {
            'format': 'best[height<=360]',
            'outtmpl': temp_output,
            'quiet': True,
        }

        # Convertir el video usando yt-dlp (que internamente usa ffmpeg)
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            # Usamos yt-dlp para procesar el archivo local
            ydl.download([f'file:{temp_input}'])

        await update.message.reply_text("✅ *Video convertido*\n📤 *Enviando...*", parse_mode='Markdown')

        # Enviar el video convertido
        with open(temp_output, 'rb') as video_file:
            await context.bot.send_video(
                chat_id=update.message.chat_id,
                video=video_file,
                caption="🎥 *Video convertido a 360p*\n¡Listo para usar!",
                parse_mode='Markdown'
            )

        # Limpiar archivos temporales
        try:
            os.remove(temp_input)
            os.remove(temp_output)
        except Exception as e:
            logging.warning(f"No se pudieron eliminar archivos temporales: {e}")

    except Exception as e:
        error_msg = f"❌ *Error al procesar el video:*\n\n{str(e)}"
        await update.message.reply_text(error_msg, parse_mode='Markdown')
        
        # Limpiar archivos temporales en caso de error
        try:
            if 'temp_input' in locals():
                os.remove(temp_input)
            if 'temp_output' in locals():
                os.remove(temp_output)
        except:
            pass

async def handle_message(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Maneja mensajes de texto"""
    await update.message.reply_text(
        "📹 Envíame un video directamente y lo convertiré a 360p optimizado.",
        parse_mode='Markdown'
    )

def main():
    print("🎥 Iniciando Bot Convertidor de Videos a 360p...")
    
    application = Application.builder().token(TOKEN).build()

    # Handlers
    application.add_handler(MessageHandler(filters.VIDEO, handle_video))
    application.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_message))
    
    # Comando start
    from telegram.ext import CommandHandler
    application.add_handler(CommandHandler("start", start))

    print("✅ Bot iniciado correctamente!")
    print("📹 Listo para recibir videos y convertirlos a 360p")
    application.run_polling()

if __name__ == '__main__':
    main()