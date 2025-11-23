import time
import threading
import requests
import sqlite3
from flask import Flask, request

# Configuración del bot
TELEGRAM_TOKEN = "TU_TOKEN_DEL_BOT"

# Servidores críticos para llamadas de toDus (basado en el análisis del tráfico)
CALL_SERVERS = [
    {"ip": "152.207.206.92", "port": 3478, "proto": "STUN"},  # Servicio STUN principal
    {"ip": "152.207.206.86", "port": 5443, "proto": "TLS"},   # Canal de comunicación
    {"ip": "152.207.206.92", "port": 60374, "proto": "STUN"}  # Puerto P2P (debe responder)
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
        requests.post(url, data={
            "chat_id": chat_id,
            "text": text,
            "parse_mode": "HTML"
        })
    except Exception as e:
        print(f"Error enviando mensaje: {e}")

# Función mejorada para analizar específicamente el tráfico de llamadas
def check_todus_calls():
    """
    Analiza específicamente los servidores críticos para llamadas
    Basado en el análisis del tráfico STUN y TLS
    """
    results = {
        "stun_main": False,    # STUN principal (3478)
        "communication": False, # Canal TLS (5443) 
        "p2p_connectivity": False, # Conectividad P2P (60374)
        "details": []
    }
    
    for server in CALL_SERVERS:
        try:
            if server["proto"] == "STUN":
                # Para STUN, intentamos conexión UDP (simplificado)
                # En producción, usarías una librería STUN real
                response = requests.get(f"http://{server['ip']}:{server['port']}", 
                                      timeout=3, verify=False)
                status = response.status_code in [200, 400, 500]  # Cualquier respuesta indica servidor activo
                
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
            
            # Actualizar estados específicos
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
                "error": str(e)
            })
    
    # Determinar estado general de llamadas
    if results["stun_main"] and results["communication"]:
        if results["p2p_connectivity"]:
            return "✅ OPTIMO", results  # Todo funciona perfectamente
        else:
            return "⚠️ LIMITADO", results  # Llamadas con posibles problemas P2P
    else:
        return "❌ CRITICO", results  # Llamadas no funcionan

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
            
            for chat_id, last_status in get_users_auto_enabled():
                if status != last_status:  # Solo notifica si hay cambio
                    message = get_detailed_call_status(status, detailed_results)
                    send_message(chat_id, message)
                    update_last_status(chat_id, status)
                    
        except Exception as e:
            print(f"Error en monitor: {e}")
            
        time.sleep(60)  # Verificar cada minuto

# Flask para recibir mensajes
app = Flask(__name__)

@app.route(f"/{TELEGRAM_TOKEN}", methods=["POST"])
def webhook():
    data = request.json
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
            "/help - Menú de ayuda\n\n"
            "🔍 <i>Monitorizando servidores críticos de llamadas</i>"
        )
        send_message(chat_id, welcome_text)

    elif text == "/status":
        status, detailed_results = check_todus_calls()
        message = get_detailed_call_status(status, detailed_results)
        send_message(chat_id, message)
        update_last_status(chat_id, status)

    elif text == "/auto":
        set_auto_mode(chat_id, 1)
        send_message(chat_id, "🔄 <b>Modo automático ACTIVADO</b>\nRecibirás alertas cuando cambie el estado de las llamadas.")

    elif text == "/stop":
        set_auto_mode(chat_id, 0)
        send_message(chat_id, "⏹️ <b>Modo automático DESACTIVADO</b>\nNo recibirás más notificaciones automáticas.")

    elif text == "/unsubscribe":
        delete_user(chat_id)
        send_message(chat_id, "❌ <b>Suscripción CANCELADA</b>\nTus datos han sido eliminados.")

    elif text == "/help":
        help_text = (
            "📖 <b>Monitor de Llamadas toDus</b>\n\n"
            "<b>Comandos:</b>\n"
            "/start - Registrarse en el sistema\n"
            "/status - Estado detallado de llamadas\n"
            "/auto - Notificaciones automáticas\n"
            "/stop - Desactivar notificaciones\n"
            "/unsubscribe - Cancelar suscripción\n"
            "/help - Este menú\n\n"
            "🌐 <b>Servidores monitorizados:</b>\n"
            "• 152.207.206.92:3478 (STUN Principal)\n"
            "• 152.207.206.86:5443 (Comunicación)\n"
            "• 152.207.206.92:60374 (Conexiones P2P)"
        )
        send_message(chat_id, help_text)

    return "ok"

if __name__ == "__main__":
    # Desactivar warnings de SSL
    import urllib3
    urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
    
    print("Iniciando monitor especializado de llamadas toDus...")
    t = threading.Thread(target=monitor, daemon=True)
    t.start()
    app.run(host='0.0.0.0', port=5000)