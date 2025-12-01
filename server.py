import os
import asyncio
import logging
import requests
from urllib.parse import urlparse
from telethon import TelegramClient, events
from telethon.tl.types import DocumentAttributeFilename
from dotenv import load_dotenv

# ==================== CONFIGURACIÓN INICIAL ====================
# Cargar variables del archivo .env (solo para desarrollo local)
load_dotenv()

# Configurar logging para ver lo que sucede
logging.basicConfig(
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    level=logging.INFO
)
logger = logging.getLogger(__name__)

# ==================== OBTENER CREDENCIALES ====================
# OBTÉN ESTOS VALORES DESDE my.telegram.org
API_ID = int(os.getenv('API_ID', '32471788'))  # Tu api_id real
API_HASH = os.getenv('API_HASH', 'cb57130abda56877acf3b3027e569450')  # Tu api_hash real
PHONE_NUMBER = os.getenv('PHONE_NUMBER', '+573001234567')  # Tu número con código país

# Verificar que tenemos las credenciales
if not all([API_ID, API_HASH, PHONE_NUMBER]):
    logger.error("❌ FALTAN CREDENCIALES. Configura las variables en Render.")
    raise ValueError("Configura API_ID, API_HASH y PHONE_NUMBER en Render")

# ==================== INICIAR CLIENTE ====================
client = TelegramClient('session_name', API_ID, API_HASH)

# ==================== FUNCIÓN PARA DESCARGAR ARCHIVOS ====================
def descargar_archivo(url):
    """Descarga un archivo desde una URL y devuelve la ruta local y nombre original"""
    try:
        # Obtener nombre del archivo desde la URL
        parsed_url = urlparse(url)
        nombre_archivo = os.path.basename(parsed_url.path)
        
        if not nombre_archivo:
            nombre_archivo = 'archivo_descargado'
        
        # Descargar el archivo
        logger.info(f"Descargando: {nombre_archivo}")
        response = requests.get(url, stream=True, timeout=60)
        response.raise_for_status()
        
        # Guardar temporalmente
        with open(nombre_archivo, 'wb') as f:
            for chunk in response.iter_content(chunk_size=8192):
                f.write(chunk)
        
        return nombre_archivo, nombre_archivo
        
    except Exception as e:
        logger.error(f"Error descargando: {e}")
        raise

# ==================== MANEJADOR DE MENSAJES ====================
@client.on(events.NewMessage(pattern=r'https?://'))
async def manejar_enlace(event):
    """Procesa mensajes que contienen enlaces HTTP/HTTPS"""
    url = event.message.text.strip()
    user = await event.get_sender()
    
    logger.info(f"Enlace recibido de @{user.username}: {url[:50]}...")
    mensaje = await event.reply("⏳ Descargando tu archivo...")
    
    try:
        # 1. Descargar archivo
        await mensaje.edit("📥 Descargando desde la URL...")
        ruta_archivo, nombre_original = descargar_archivo(url)
        
        # 2. Subir a Telegram
        await mensaje.edit("📤 Subiendo a Telegram...")
        
        await client.send_file(
            entity=event.chat_id,
            file=ruta_archivo,
            caption=f"✅ {nombre_original}\nSubido via bot",
            force_document=True,
            attributes=[DocumentAttributeFilename(file_name=nombre_original)]
        )
        
        # 3. Limpiar
        os.remove(ruta_archivo)
        await mensaje.delete()
        logger.info(f"Archivo {nombre_original} subido exitosamente")
        
    except Exception as e:
        error_msg = f"❌ Error: {str(e)}"
        await mensaje.edit(error_msg)
        logger.error(f"Error procesando {url}: {e}")

@client.on(events.NewMessage(pattern='/start'))
async def comando_start(event):
    """Responde al comando /start"""
    await event.reply(
        "🤖 **Bot de Descarga de Archivos**\n\n"
        "Solo envíame un enlace directo a un archivo y yo lo descargaré "
        "y lo subiré aquí.\n\n"
        "✅ Soporta archivos grandes\n"
        "🔗 Ejemplo: https://ejemplo.com/mi_archivo.zip"
    )

@client.on(events.NewMessage(pattern='/help'))
async def comando_help(event):
    """Responde al comando /help"""
    await event.reply(
        "📖 **Ayuda**\n\n"
        "1. Envíame cualquier enlace directo a un archivo\n"
        "2. Yo lo descargaré y subiré a este chat\n"
        "3. Listo!\n\n"
        "Comandos:\n"
        "/start - Mensaje de bienvenida\n"
        "/help - Esta ayuda"
    )

# ==================== FUNCIÓN PRINCIPAL ====================
async def main():
    """Función principal que inicia el bot"""
    await client.start(phone=PHONE_NUMBER)
    
    # Mostrar información de conexión
    me = await client.get_me()
    logger.info(f"✅ Bot iniciado como: {me.first_name} (@{me.username})")
    logger.info(f"📞 Conectado con el número: {PHONE_NUMBER}")
    
    # Mantener el bot activo
    await client.run_until_disconnected()

# ==================== EJECUCIÓN ====================
if __name__ == '__main__':
    asyncio.run(main())