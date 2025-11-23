import time
import threading
import requests
import sqlite3
from flask import Flask, request
import os

# Configuración del bot - REEMPLAZA CON TU TOKEN REAL
TELEGRAM_TOKEN = "8242851494:AAF311mHQ-MO6Hbjkdkq_gv_mVLy8ysivvM"

# Obtener URL del servicio de Render
RENDER_URL = os.getenv('RENDER_EXTERNAL_URL', 'https://tdusllamadas.onrender.com')
WEBHOOK_URL = f"{RENDER_URL}/{TELEGRAM_TOKEN}"

# Servidores críticos para llamadas de toDus
CALL_SERVERS = [
    {"ip": "152.207.206.92", "port": 3478, "proto": "STUN"},
    {"ip": "152.207.206.86", "port": 5443, "proto": "TLS"},
    {"ip": "152.207.206.92", "port": 60374, "proto": "STUN"}
]

# Inicializar base de datos
conn = sqlite3.connect("users.db", check_same_thread=False)
cursor = conn.cursor()
cursor.execute("""
CREATE TABLE IF NOT EXISTS users (
    chat_id INTEGER PRIMARY KEY,
    auto_mode INTEGER DEFAULT 0,
    last_status TEXT
)
""")
conn.commit()

def add_user(chat_id):
    cursor.execute("INSERT OR IGNORE INTO users (chat_id) VALUES (?)", (chat_id,))
    conn.commit()

def set_auto_mode(chat_id, mode):
    cursor.execute("UPDATE users SET auto_mode=? WHERE chat_id=?", (mode, chat_id))
    conn.commit()

def update_last_status(chat_id, status):
    cursor.execute("UPDATE users SET last_status=? WHERE chat_id=?", (status, chat_id))
    conn.commit()

def delete_user(chat_id):
    cursor.execute("DELETE FROM users WHERE chat_id=?", (chat_id,))
    conn.commit()

def get_users_auto_enabled():
    cursor.execute("SELECT chat_id, last_status FROM users WHERE auto_mode=1")
    return cursor.fetchall()

def send_message(chat_id, text):
    url = f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendMessage"
    try:
        response = requests.post(url, data={
            "chat_id": chat_id,
            "text": text,
            "parse_mode": "HTML"
        })
        print(f"Mensaje enviado a {chat_id}: {response.status_code}")
    except Exception as e:
        print(f"Error enviando mensaje: {e}")

def setup_webhook():
    """Configurar el webhook en Telegram"""
    url = f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/setWebhook"
    data = {"url": WEBHOOK_URL}
    
    try:
        response = requests.post(url, data=data)
        print(f"Webhook configurado: {response.status_code}")
        print(f"Respuesta: {response.text}")
    except Exception as e:
        print(f"Error configurando webhook: {e}")

def check_todus_calls():
    """Verifica el estado de los servidores de llamadas"""
    results = {
        "stun_main": False,
        "communication": False,
        "p2p_connectivity": False,
        "details": []
    }
    
    for server in CALL_SERVERS:
        try:
            if server["proto"] == "STUN":
                # Para STUN usamos un puerto común
                response = requests.get(f"http://{server['ip']}:{server['port']}", 
                                      timeout=3, verify=False)
                status = response.status_code in [200, 400, 500]
            else:  # TLS
                response = requests.get(f"https://{server['ip']}:{server['port']}", 
                                      timeout=5, verify=False)
                status = response.status_code == 200
            
            results["details"].append({
                "server": f"{server['ip']}:{server['port']}",
                "protocol": server["proto"],
                "status": "✅ Online" if status else "❌ Offline",
                "response_time": response.elapsed.total_seconds() if status else None
            })
            
            if server["port"] == 3478 and status:
                results["stun_main"] = True
            elif server["port"] == 5443 and status:
                results["communication"] = True
            elif server["port"] == 60374 and status:
                results["p2p_connectivity"] = True
                
        except Exception as e:
            results["details"].append({
                "server": f"{server['ip']}:{server['port']}",
                "protocol": server["proto"],
                "status": "❌ Error",
                "error": str(e)[:50]  # Limitar longitud del error
            })
    
    # Determinar estado general
    if results["stun_main"] and results["communication"]:
        if results["p2p_connectivity"]:
            return "✅ OPTIMO", results
        else:
            return "⚠️ LIMITADO", results
    else:
        return "❌ CRITICO", results

def get_detailed_call_status(status, results):
    """Genera mensaje detallado del estado de llamadas"""
    message = "🔔📞 <b>ANÁLISIS DE LLAMADAS toDus</b>\n\n"
    
    if status == "✅ OPTIMO":
        message += "🌐 <b>Estado:</b> FUNCIONANDO ÓPTIMO ✅\n"
        message += "📞 <i>Las llamadas deberían trabajar correctamente</i>\n\n"
    elif status == "⚠️ LIMITADO":
        message += "🌐 <b>Estado:</b> CON PROBLEMAS ⚠️\n"
        message += "📞 <i>Las llamadas pueden fallar o tener baja calidad</i>\n\n"
    else:
        message += "🌐 <b>Estado:</b> NO FUNCIONAN ❌\n"
        message += "📞 <i>El servicio de llamadas está caído</i>\n\n"
    
    message += "<b>Servidores de Llamadas:</b>\n"
    for detail in results["details"]:
        message += f"{detail['status']} <b>{detail['server']}</b> ({detail['protocol']})\n"
        if 'response_time' in detail and detail['response_time']:
            message += f"   ⏱️ {detail['response_time']:.2f}s\n"
        if 'error' in detail:
            message += f"   🔧 {detail['error']}\n"
    
    message += f"\n🕒 <i>Actualizado: {time.strftime('%Y-%m-%d %H:%M:%S')}</i>"
    return message

def monitor():
    """Monitor especializado en tráfico de llamadas"""
    while True:
        try:
            status, detailed_results = check_todus_calls()
            print(f"Monitor: Estado {status}")
            
            for chat_id, last_status in get_users_auto_enabled():
                if status != last_status:
                    message = get_detailed_call_status(status, detailed_results)
                    send_message(chat_id, message)
                    update_last_status(chat_id, status)
                    print(f"Notificación enviada a {chat_id}")
                    
        except Exception as e:
            print(f"Error en monitor: {e}")
            
        time.sleep(60)

# Flask para recibir mensajes
app = Flask(__name__)

@app.route('/')
def home():
    return "🤖 Bot de Llamadas toDus funcionando ✅"

@app.route(f'/{TELEGRAM_TOKEN}', methods=['POST'])
def webhook():
    try:
        data = request.json
        print(f"Mensaje recibido: {data}")
        
        if 'message' not in data:
            return "ok"
            
        chat_id = data["message"]["chat"]["id"]
        text = data["message"]["text"]

        if text == "/start":
            add_user(chat_id)
            welcome_text = (
                "🔔 <b>Monitor de Llamadas toDus</b> ✅\n\n"
                "Sistema especializado en analizar el tráfico REAL de llamadas\n\n"
                "📖 <b>Comandos disponibles:</b>\n"
                "/status - Estado detallado de llamadas\n"
                "/auto - Notificaciones automáticas\n"
                "/stop - Desactivar notificaciones\n"
                "/unsubscribe - Cancelar suscripción\n"
                "/help - Menú de ayuda"
            )
            send_message(chat_id, welcome_text)

        elif text == "/status":
            status, detailed_results = check_todus_calls()
            message = get_detailed_call_status(status, detailed_results)
            send_message(chat_id, message)
            update_last_status(chat_id, status)

        elif text == "/auto":
            set_auto_mode(chat_id, 1)
            send_message(chat_id, "🔄 <b>Modo automático ACTIVADO</b>")

        elif text == "/stop":
            set_auto_mode(chat_id, 0)
            send_message(chat_id, "⏹️ <b>Modo automático DESACTIVADO</b>")

        elif text == "/unsubscribe":
            delete_user(chat_id)
            send_message(chat_id, "❌ <b>Suscripción CANCELADA</b>")

        elif text == "/help":
            help_text = (
                "📖 <b>Monitor de Llamadas toDus</b>\n\n"
                "<b>Comandos:</b>\n"
                "/start - Registrarse\n"
                "/status - Estado de llamadas\n"
                "/auto - Notificaciones automáticas\n"
                "/stop - Desactivar notificaciones\n"
                "/unsubscribe - Cancelar\n"
                "/help - Este menú"
            )
            send_message(chat_id, help_text)

    except Exception as e:
        print(f"Error en webhook: {e}")

    return "ok"

if __name__ == "__main__":
    # Desactivar warnings de SSL
    import urllib3
    urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
    
    print("Iniciando monitor especializado de llamadas toDus...")
    print(f"Webhook URL: {WEBHOOK_URL}")
    
    # Configurar webhook al iniciar
    setup_webhook()
    
    # Hilo para monitor
    t = threading.Thread(target=monitor, daemon=True)
    t.start()
    
    # Obtener puerto de Render
    port = int(os.environ.get("PORT", 5000))
    app.run(host='0.0.0.0', port=port, debug=False)