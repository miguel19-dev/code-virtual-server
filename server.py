import os
import logging
import subprocess
from telegram import Update
from telegram.ext import Application, MessageHandler, filters, ContextTypes, CommandHandler

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
        
        # Nombres de archivos temporales
        temp_input = f"temp_input_{file_id}.mp4"
        temp_output = f"temp_output_{file_id}.mp4"
        
        # Descargar el archivo
        await file.download_to_drive(temp_input)

        await update.message.reply_text("🔄 *Convirtiendo video...*", parse_mode='Markdown')

        # Convertir el video a 360p usando FFmpeg directamente
        ffmpeg_command = [
            'ffmpeg',
            '-i', temp_input,           # Archivo de entrada
            '-vf', 'scale=-2:360',      # Escalar a 360p manteniendo relación de aspecto
            '-c:v', 'libx264',          # Codec de video
            '-crf', '23',               # Calidad (23 es buen balance)
            '-preset', 'medium',        # Velocidad de compresión
            '-c:a', 'aac',              # Codec de audio
            '-b:a', '128k',             # Bitrate de audio
            '-y',                       # Sobrescribir archivo de salida
            temp_output
        ]

        # Ejecutar FFmpeg
        result = subprocess.run(
            ffmpeg_command,
            capture_output=True,
            text=True,
            timeout=300  # 5 minutos de timeout
        )

        if result.returncode != 0:
            raise Exception(f"FFmpeg error: {result.stderr}")

        await update.message.reply_text("✅ *Video convertido*\n📤 *Enviando...*", parse_mode='Markdown')

        # Enviar el video convertido
        with open(temp_output, 'rb') as video_file:
            await context.bot.send_video(
                chat_id=update.message.chat_id,
                video=video_file,
                caption="🎥 *Video convertido a 360p*\n¡Listo para usar!",
                parse_mode='Markdown',
                supports_streaming=True
            )

        await update.message.reply_text("✅ *¡Conversión completada!*", parse_mode='Markdown')

    except subprocess.TimeoutExpired:
        error_msg = "❌ *Tiempo de espera agotado*\nEl video es muy largo o complejo."
        await update.message.reply_text(error_msg, parse_mode='Markdown')
    except Exception as e:
        error_msg = f"❌ *Error al procesar el video:*\n\n{str(e)}"
        await update.message.reply_text(error_msg, parse_mode='Markdown')
    finally:
        # Limpiar archivos temporales
        try:
            if os.path.exists(temp_input):
                os.remove(temp_input)
            if os.path.exists(temp_output):
                os.remove(temp_output)
        except Exception as e:
            logging.warning(f"No se pudieron eliminar archivos temporales: {e}")

async def handle_message(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Maneja mensajes de texto"""
    await update.message.reply_text(
        "📹 Envíame un video directamente y lo convertiré a 360p optimizado.",
        parse_mode='Markdown'
    )

def main():
    print("🎥 Iniciando Bot Convertidor de Videos a 360p...")
    
    # Verificar que FFmpeg está disponible
    try:
        subprocess.run(['ffmpeg', '-version'], capture_output=True, check=True)
        print("✅ FFmpeg está disponible")
    except (subprocess.CalledProcessError, FileNotFoundError):
        print("❌ ERROR: FFmpeg no está instalado o no está en el PATH")
        return

    application = Application.builder().token(TOKEN).build()

    # Handlers
    application.add_handler(CommandHandler("start", start))
    application.add_handler(MessageHandler(filters.VIDEO, handle_video))
    application.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_message))

    print("✅ Bot iniciado correctamente!")
    print("📹 Listo para recibir videos y convertirlos a 360p")
    application.run_polling()

if __name__ == '__main__':
    main()