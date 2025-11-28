// Variables globales
const socket = io();
let currentUser = null;
let selectedUser = null;
let onlineUsers = [];
let allUsers = [];
let activeChats = [];
let unreadCounts = {};
let newAvatarFile = null;
let typingTimeouts = {};
let userLastSeen = {};
let followers = [];
let following = [];
let currentProfileUser = null;

// Inicializar la aplicación
document.addEventListener('DOMContentLoaded', async function() {
    currentUser = JSON.parse(localStorage.getItem('currentUser'));
    
    if (!currentUser) {
        window.location.href = '/';
        return;
    }
    
    // Inicializar datos del perfil si no existen
    if (!currentUser.bio) currentUser.bio = "¡Yo uso SecureChat!";
    if (!currentUser.avatar) currentUser.avatar = '/default-avatar.png';
    
    // Mostrar información del usuario actual
    updateCurrentUserDisplay();
    
    // Mostrar skeletons mientras carga
    showSkeletons();
    
    // Configurar event listeners
    setupEventListeners();
    
    // Conectar al socket
    socket.emit('user_online', currentUser);
    
    // Cargar datos iniciales
    await loadInitialData();
    
    // Solicitar contadores de mensajes no leídos
    socket.emit('get_unread_counts', currentUser.id);
    
    // Cargar datos de seguidores/seguidos
    loadFollowData();
    
    // Forzar que chats sea la pestaña activa inicialmente
    showTab('chats');
});

// Configurar event listeners
function setupEventListeners() {
    // Navegación
    document.getElementById('menu-btn').addEventListener('click', togglePanel);
    document.getElementById('panel-overlay').addEventListener('click', togglePanel);
    document.getElementById('my-profile-btn').addEventListener('click', showMyProfile);
    document.getElementById('logout-btn').addEventListener('click', logout);
    
    // Navegación entre pestañas
    document.getElementById('fab-button').addEventListener('click', () => showTab('users'));
    document.getElementById('empty-chats-action').addEventListener('click', () => showTab('users'));
    document.getElementById('chat-back-btn').addEventListener('click', () => showTab('chats'));
    document.getElementById('users-back-btn').addEventListener('click', () => showTab('chats'));
    
    // Navegación de perfiles
    document.getElementById('my-profile-back-btn').addEventListener('click', hideMyProfile);
    document.getElementById('user-profile-back-btn').addEventListener('click', hideUserProfile);
    document.getElementById('edit-profile-btn').addEventListener('click', showEditProfile);
    document.getElementById('edit-profile-back-btn').addEventListener('click', hideEditProfile);
    document.getElementById('cancel-edit-btn').addEventListener('click', hideEditProfile);
    
    // Seguidores/Seguidos
    document.getElementById('followers-stat').addEventListener('click', showFollowers);
    document.getElementById('following-stat').addEventListener('click', showFollowing);
    document.getElementById('followers-back-btn').addEventListener('click', hideFollowers);
    document.getElementById('following-back-btn').addEventListener('click', hideFollowing);
    
    // Botones de perfil de usuario
    document.getElementById('follow-btn').addEventListener('click', toggleFollow);
    document.getElementById('user-followers-stat').addEventListener('click', showUserFollowers);
    document.getElementById('user-following-stat').addEventListener('click', showUserFollowing);
    
    // Editar perfil
    document.getElementById('save-profile-btn').addEventListener('click', saveMyProfile);
    document.getElementById('delete-account-btn').addEventListener('click', deleteAccount);
    document.getElementById('avatar-input').addEventListener('change', previewAvatar);
    
    // Chat
    document.getElementById('send-button').addEventListener('click', sendMessage);
    document.getElementById('message-input').addEventListener('keypress', function(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });
    
    // Auto-resize del textarea
    document.getElementById('message-input').addEventListener('input', function() {
        this.style.height = 'auto';
        this.style.height = Math.min(this.scrollHeight, 120) + 'px';
    });
    
    // Detectar escritura para el indicador "escribiendo"
    let typingTimer;
    document.getElementById('message-input').addEventListener('input', function() {
        if (!selectedUser) return;
        
        // Notificar que está escribiendo
        socket.emit('user_typing', {
            to: selectedUser,
            from: currentUser
        });
        
        // Limpiar timer anterior
        clearTimeout(typingTimer);
        
        // Notificar que dejó de escribir después de 1 segundo
        typingTimer = setTimeout(() => {
            socket.emit('user_stop_typing', {
                to: selectedUser,
                from: currentUser
            });
        }, 1000);
    });
    
    // Socket events
    socket.on('users_online', (users) => {
        onlineUsers = users;
        updateOnlineStatus();
    });
    
    socket.on('all_users', (users) => {
        allUsers = users;
        loadUsers();
    });
    
    socket.on('user_updated', (updatedUser) => {
        // Actualizar en la lista local
        const userIndex = allUsers.findIndex(u => u.id === updatedUser.id);
        if (userIndex !== -1) {
            allUsers[userIndex] = updatedUser;
        }
        
        // Si es el usuario actual, actualizar localStorage
        if (updatedUser.id === currentUser.id) {
            currentUser = updatedUser;
            localStorage.setItem('currentUser', JSON.stringify(currentUser));
            updateCurrentUserDisplay();
            updateMyProfileDisplay();
        }
        
        // Si es el usuario seleccionado, actualizar header
        if (selectedUser && selectedUser.id === updatedUser.id) {
            selectedUser = updatedUser;
            document.getElementById('current-chat-name').textContent = updatedUser.name;
            updateAvatarDisplay('current-chat-avatar', updatedUser.avatar, updatedUser.name);
        }
        
        // Recargar datos
        loadUsers();
        loadActiveChats();
    });
    
    socket.on('new_message', (messageData) => {
        const sender = allUsers.find(u => u.id === messageData.from);
        
        // Agregar a chats activos si no existe
        if (!activeChats.find(chat => chat.user.id === messageData.from)) {
            activeChats.push({
                user: sender,
                lastMessage: messageData.message,
                lastTime: new Date().toLocaleTimeString('es-ES', {
                    hour: '2-digit',
                    minute: '2-digit'
                })
            });
        }
        
        // Si el mensaje es para el chat actual, mostrarlo
        if (selectedUser && selectedUser.id === messageData.from) {
            addMessageToUI(messageData);
            
            // Marcar como leído automáticamente
            socket.emit('mark_as_read', {
                userId: currentUser.id,
                otherUserId: selectedUser.id
            });
        }
        
        // Actualizar último mensaje en chats activos
        const chat = activeChats.find(c => c.user.id === messageData.from);
        if (chat) {
            chat.lastMessage = messageData.message.length > 30 ? 
                messageData.message.substring(0, 30) + '...' : messageData.message;
            chat.lastTime = new Date().toLocaleTimeString('es-ES', {
                hour: '2-digit',
                minute: '2-digit'
            });
        }
        
        // Recargar lista de chats
        loadActiveChats();
    });
    
    socket.on('unread_counts', (counts) => {
        unreadCounts = { ...unreadCounts, ...counts };
        updateUnreadBadges();
        loadActiveChats();
    });
    
    socket.on('unread_count_update', (data) => {
        unreadCounts[data.userId] = data.count;
        updateUnreadBadge(data.userId, data.count);
        loadActiveChats();
    });
    
    socket.on('user_offline', (userData) => {
        userLastSeen[userData.id] = userData.lastSeen || new Date().toISOString();
        if (selectedUser && selectedUser.id === userData.id) {
            updateUserOnlineStatus(selectedUser);
        }
        updateOnlineStatus();
    });
    
    socket.on('user_typing', (data) => {
        if (data.from !== currentUser.id) {
            showTypingIndicator(data.from);
        }
    });
    
    socket.on('user_stop_typing', (data) => {
        if (data.from !== currentUser.id) {
            hideTypingIndicator(data.from);
        }
    });
    
    // Seguidores en tiempo real
    socket.on('follow_data', (data) => {
        followers = data.followers;
        following = data.following;
        updateFollowCounts();
    });
    
    socket.on('follow_updated', (data) => {
        // Actualizar estado de seguimiento
        const userIndex = following.findIndex(u => u.id === data.followingId);
        if (data.isFollowing && userIndex === -1) {
            const user = allUsers.find(u => u.id === data.followingId);
            if (user) following.push(user);
        } else if (!data.isFollowing && userIndex !== -1) {
            following.splice(userIndex, 1);
        }
        updateFollowCounts();
    });
    
    socket.on('follower_updated', (data) => {
        // Actualizar contador de seguidores
        loadFollowData();
    });
    
    // Actualización de chats en tiempo real
    socket.on('chats_updated', () => {
        loadActiveChats();
    });
}

// Mostrar skeletons de carga
function showSkeletons() {
    // Skeleton para chats
    const chatsSkeleton = document.getElementById('chats-skeleton');
    chatsSkeleton.innerHTML = '';
    for (let i = 0; i < 3; i++) {
        const skeletonItem = document.createElement('div');
        skeletonItem.className = 'chat-item';
        skeletonItem.innerHTML = `
            <div class="skeleton skeleton-avatar"></div>
            <div class="chat-info">
                <div class="skeleton skeleton-text short"></div>
                <div class="skeleton skeleton-text medium"></div>
            </div>
        `;
        chatsSkeleton.appendChild(skeletonItem);
    }
    
    // Skeleton para usuarios
    const usersSkeleton = document.getElementById('users-skeleton');
    usersSkeleton.innerHTML = '';
    for (let i = 0; i < 5; i++) {
        const skeletonItem = document.createElement('div');
        skeletonItem.className = 'user-item';
        skeletonItem.innerHTML = `
            <div class="skeleton skeleton-avatar"></div>
            <div class="user-info">
                <div class="skeleton skeleton-text short"></div>
                <div class="skeleton skeleton-text medium"></div>
            </div>
        `;
        usersSkeleton.appendChild(skeletonItem);
    }
}

// Ocultar skeletons
function hideSkeletons() {
    document.getElementById('chats-skeleton').style.display = 'none';
    document.getElementById('users-skeleton').style.display = 'none';
}

// Cargar datos de seguidores/seguidos
function loadFollowData() {
    socket.emit('get_follow_data', currentUser.id);
}

// Actualizar contadores de seguidores/seguidos
function updateFollowCounts() {
    document.getElementById('followers-count').textContent = followers.length;
    document.getElementById('following-count').textContent = following.length;
    
    if (currentProfileUser) {
        document.getElementById('user-followers-count').textContent = '0'; // Actualizar con datos reales
        document.getElementById('user-following-count').textContent = '0'; // Actualizar con datos reales
    }
}

// Cargar datos iniciales
async function loadInitialData() {
    await loadUsers();
    await loadActiveChats();
    hideSkeletons();
}

// Cargar lista de usuarios
async function loadUsers() {
    try {
        const response = await fetch('/api/users');
        allUsers = await response.json();
        
        const usersList = document.getElementById('users-list');
        const emptyState = document.getElementById('users-empty');
        
        const otherUsers = allUsers.filter(user => user.id !== currentUser.id);
        
        if (otherUsers.length === 0) {
            usersList.style.display = 'none';
            emptyState.style.display = 'flex';
        } else {
            usersList.style.display = 'block';
            emptyState.style.display = 'none';
            
            usersList.innerHTML = '';
            
            otherUsers.forEach(user => {
                if (!user.bio) user.bio = "¡Yo uso SecureChat!";
                if (!user.avatar) user.avatar = '/default-avatar.png';
                
                const userItem = document.createElement('div');
                userItem.className = 'user-item';
                userItem.dataset.userId = user.id;
                userItem.innerHTML = `
                    <div class="user-avatar">
                        ${user.avatar !== '/default-avatar.png' ? 
                            `<img src="${user.avatar}" alt="${user.name}" onerror="this.style.display='none'">` : 
                            user.name.charAt(0).toUpperCase()
                        }
                        <div class="user-online-status" id="user-online-${user.id}"></div>
                    </div>
                    <div class="user-info">
                        <div class="user-name">${user.name}</div>
                        <div class="user-bio-small">${user.bio}</div>
                    </div>
                `;
                
                // MEJORADO: Event listener corregido para iniciar chat
                userItem.addEventListener('click', (e) => {
                    console.log('Iniciando chat con:', user.name);
                    startChat(user.id);
                });
                
                userItem.querySelector('.user-avatar').addEventListener('click', (e) => {
                    e.stopPropagation();
                    showOtherUserProfile(user.id);
                });
                
                usersList.appendChild(userItem);
            });
        }
        
        updateOnlineStatus();
    } catch (error) {
        console.error('Error cargando usuarios:', error);
        hideSkeletons();
    }
}

// Cargar chats activos
async function loadActiveChats() {
    try {
        const chatsList = document.getElementById('chats-list');
        const emptyState = document.getElementById('chats-empty');
        
        // Obtener chats del servidor
        const response = await fetch(`/api/chats?userId=${currentUser.id}`);
        const chatsData = await response.json();
        
        activeChats = chatsData;
        
        if (activeChats.length === 0) {
            chatsList.style.display = 'none';
            emptyState.style.display = 'flex';
        } else {
            chatsList.style.display = 'block';
            emptyState.style.display = 'none';
            
            chatsList.innerHTML = '';
            activeChats.forEach(chat => {
                const unreadCount = unreadCounts[chat.user.id] || 0;
                const chatItem = document.createElement('div');
                chatItem.className = 'chat-item';
                chatItem.dataset.userId = chat.user.id;
                chatItem.innerHTML = `
                    <div class="chat-avatar">
                        ${chat.user.avatar !== '/default-avatar.png' ? 
                            `<img src="${chat.user.avatar}" alt="${chat.user.name}" onerror="this.style.display='none'">` : 
                            chat.user.name.charAt(0).toUpperCase()
                        }
                        <div class="online-status" id="chat-online-${chat.user.id}"></div>
                    </div>
                    <div class="chat-info">
                        <div class="chat-name">${chat.user.name}</div>
                        <div class="chat-last-message">${chat.lastMessage || 'Haz clic para chatear'}</div>
                        <div class="chat-time">${chat.lastTime || ''}</div>
                    </div>
                    ${unreadCount > 0 ? `<div class="unread-badge" id="chat-unread-${chat.user.id}">${unreadCount}</div>` : ''}
                `;
                
                // Agregar event listeners
                chatItem.addEventListener('click', () => openChat(chat.user.id));
                chatItem.querySelector('.chat-avatar').addEventListener('click', (e) => {
                    e.stopPropagation();
                    showOtherUserProfile(chat.user.id);
                });
                
                chatsList.appendChild(chatItem);
            });
        }
        
        updateOnlineStatus();
    } catch (error) {
        console.error('Error cargando chats:', error);
        hideSkeletons();
    }
}

// MEJORADO: Función para iniciar chat con un usuario
function startChat(userId) {
    console.log('startChat llamado para usuario ID:', userId);
    const user = allUsers.find(u => u.id === userId);
    if (!user) {
        console.error('Usuario no encontrado con ID:', userId);
        return;
    }
    
    console.log('Usuario encontrado:', user.name);
    
    // Agregar a chats activos si no existe
    if (!activeChats.find(chat => chat.user.id === userId)) {
        activeChats.push({
            user: user,
            lastMessage: 'Conversación iniciada',
            lastTime: new Date().toLocaleTimeString('es-ES', {
                hour: '2-digit',
                minute: '2-digit'
            })
        });
        console.log('Chat agregado a activos');
    }
    
    openChat(userId);
}

// MEJORADO: Función para abrir chat existente
function openChat(userId) {
    console.log('openChat llamado para usuario ID:', userId);
    const user = allUsers.find(u => u.id === userId);
    if (!user) {
        console.error('Usuario no encontrado en openChat:', userId);
        return;
    }
    
    selectedUser = user;
    console.log('Mostrando pestaña de chat con:', user.name);
    
    // CORRECCIÓN CRÍTICA: Mostrar pestaña de chat
    showTab('chat');
    
    // Actualizar header del chat
    document.getElementById('current-chat-name').textContent = user.name;
    updateAvatarDisplay('current-chat-avatar', user.avatar, user.name);
    
    // Actualizar estado en línea
    updateUserOnlineStatus(user);
    
    // Cargar mensajes
    loadMessages(user);
    
    // Marcar mensajes como leídos y limpiar contador
    socket.emit('mark_as_read', {
        userId: currentUser.id,
        otherUserId: user.id
    });
    
    // Limpiar contador de no leídos
    unreadCounts[user.id] = 0;
    updateUnreadBadge(user.id, 0);
    
    // Enfocar input de mensaje
    setTimeout(() => {
        const messageInput = document.getElementById('message-input');
        if (messageInput) {
            messageInput.focus();
        }
    }, 300);
}

// Actualizar estado en línea del usuario
function updateUserOnlineStatus(user) {
    const isOnline = onlineUsers.find(u => u.id === user.id);
    const statusElement = document.getElementById('current-chat-status');
    
    if (isOnline) {
        statusElement.textContent = 'En línea';
        statusElement.className = 'current-chat-status';
    } else {
        const lastSeen = userLastSeen[user.id];
        if (lastSeen) {
            const lastSeenTime = new Date(lastSeen).toLocaleTimeString('es-ES', {
                hour: '2-digit',
                minute: '2-digit'
            });
            statusElement.textContent = `Últ. vez ${lastSeenTime}`;
        } else {
            statusElement.textContent = 'Desconectado';
        }
        statusElement.className = 'current-chat-status offline';
    }
    
    document.getElementById('current-chat-online-status').className = `online-status ${isOnline ? 'online' : ''}`;
}

// Cargar mensajes del chat
async function loadMessages(user) {
    try {
        const response = await fetch(`/api/messages/${currentUser.id}/${user.id}`);
        const messages = await response.json();
        
        const messagesContainer = document.getElementById('messages-container');
        messagesContainer.innerHTML = '';
        
        messages.forEach(message => {
            addMessageToUI(message);
        });
        
        // Scroll al final
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    } catch (error) {
        console.error('Error cargando mensajes:', error);
    }
}

// Enviar mensaje
async function sendMessage() {
    const messageInput = document.getElementById('message-input');
    const message = messageInput.value.trim();
    
    if (!message || !selectedUser) return;
    
    // Limpiar input
    messageInput.value = '';
    messageInput.style.height = 'auto';
    
    // Agregar a chats activos si no existe
    if (!activeChats.find(chat => chat.user.id === selectedUser.id)) {
        activeChats.push({
            user: selectedUser,
            lastMessage: message,
            lastTime: new Date().toLocaleTimeString('es-ES', {
                hour: '2-digit',
                minute: '2-digit'
            })
        });
        loadActiveChats();
    }
    
    // Enviar mensaje via socket
    socket.emit('private_message', {
        to: selectedUser,
        message: message,
        from: currentUser
    });
}

// Agregar mensaje a la UI
function addMessageToUI(messageData) {
    const messagesContainer = document.getElementById('messages-container');
    const messageDiv = document.createElement('div');
    
    const isSent = messageData.from === currentUser.id;
    messageDiv.className = `message ${isSent ? 'sent' : 'received'}`;
    
    const time = new Date(messageData.timestamp).toLocaleTimeString('es-ES', {
        hour: '2-digit',
        minute: '2-digit'
    });
    
    messageDiv.innerHTML = `
        <div class="message-content">${messageData.message}</div>
        <div class="message-time">${time}</div>
    `;
    
    messagesContainer.appendChild(messageDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
    
    // Animación suave
    setTimeout(() => {
        messageDiv.style.opacity = '1';
    }, 10);
}

// Mostrar indicador de escribiendo
function showTypingIndicator(userId) {
    if (!selectedUser || selectedUser.id !== userId) return;
    
    const messagesContainer = document.getElementById('messages-container');
    const existingIndicator = document.getElementById('typing-indicator');
    
    if (!existingIndicator) {
        const typingDiv = document.createElement('div');
        typingDiv.id = 'typing-indicator';
        typingDiv.className = 'typing-indicator';
        typingDiv.innerHTML = `
            <div class="typing-dot"></div>
            <div class="typing-dot"></div>
            <div class="typing-dot"></div>
            <span style="font-size: 0.8em; margin-left: 8px;">escribiendo...</span>
        `;
        messagesContainer.appendChild(typingDiv);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
    
    // Actualizar estado en header
    const statusElement = document.getElementById('current-chat-status');
    statusElement.textContent = 'escribiendo...';
    statusElement.className = 'current-chat-status typing';
    
    // Limpiar timeout anterior
    if (typingTimeouts[userId]) {
        clearTimeout(typingTimeouts[userId]);
    }
    
    // Ocultar después de 3 segundos
    typingTimeouts[userId] = setTimeout(() => {
        hideTypingIndicator(userId);
    }, 3000);
}

// Ocultar indicador de escribiendo
function hideTypingIndicator(userId) {
    const indicator = document.getElementById('typing-indicator');
    if (indicator) {
        indicator.remove();
    }
    
    // Restaurar estado normal
    if (selectedUser && selectedUser.id === userId) {
        updateUserOnlineStatus(selectedUser);
    }
}

// Mostrar/ocultar panel lateral
function togglePanel() {
    const panel = document.getElementById('side-panel');
    const overlay = document.getElementById('panel-overlay');
    
    panel.classList.toggle('active');
    overlay.classList.toggle('active');
}

// MEJORADO: Función para cambiar pestañas
function showTab(tabName) {
    console.log('Cambiando a pestaña:', tabName);
    
    // Ocultar todas las pestañas
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
    });
    
    document.querySelectorAll('.users-tab-content').forEach(tab => {
        tab.classList.remove('active');
    });
    
    document.querySelectorAll('.profile-screen').forEach(screen => {
        screen.classList.remove('active');
    });
    
    document.querySelectorAll('.follow-screen').forEach(screen => {
        screen.classList.remove('active');
    });
    
    document.getElementById('edit-profile-screen').classList.remove('active');
    
    // Mostrar pestaña seleccionada - CORRECCIÓN CRÍTICA
    if (tabName === 'users') {
        document.getElementById('users-tab').classList.add('active');
        // Cargar usuarios si es necesario
        loadUsers();
    } else if (tabName === 'chat') {
        document.getElementById('chat-tab').classList.add('active');
    } else {
        // 'chats' por defecto
        document.getElementById('chats-tab').classList.add('active');
        // Recargar chats activos
        loadActiveChats();
    }
    
    // Ocultar panel lateral si está abierto
    const panel = document.getElementById('side-panel');
    const overlay = document.getElementById('panel-overlay');
    panel.classList.remove('active');
    overlay.classList.remove('active');
    
    // Mostrar/ocultar FAB button - solo en pestaña de chats
    const fabButton = document.getElementById('fab-button');
    if (fabButton) {
        if (tabName === 'chats') {
            fabButton.style.display = 'flex';
        } else {
            fabButton.style.display = 'none';
        }
    }
    
    // Enfocar input de mensaje si estamos en el chat
    if (tabName === 'chat' && selectedUser) {
        setTimeout(() => {
            const messageInput = document.getElementById('message-input');
            if (messageInput) {
                messageInput.focus();
            }
        }, 500);
    }
}

// Mostrar mi perfil
function showMyProfile() {
    document.getElementById('my-profile-screen').classList.add('active');
    updateMyProfileDisplay();
    
    // Ocultar panel
    togglePanel();
}

// Ocultar mi perfil
function hideMyProfile() {
    document.getElementById('my-profile-screen').classList.remove('active');
}

// Mostrar editar perfil
function showEditProfile() {
    document.getElementById('edit-profile-screen').classList.add('active');
    document.getElementById('edit-profile-name').value = currentUser.name;
    document.getElementById('edit-profile-bio').value = currentUser.bio;
    document.getElementById('edit-profile-password').value = '';
    
    // Resetear preview
    document.getElementById('avatar-preview').style.display = 'none';
    newAvatarFile = null;
}

// Ocultar editar perfil
function hideEditProfile() {
    document.getElementById('edit-profile-screen').classList.remove('active');
}

// Mostrar seguidores
function showFollowers() {
    document.getElementById('followers-screen').classList.add('active');
    loadFollowersList();
}

// Ocultar seguidores
function hideFollowers() {
    document.getElementById('followers-screen').classList.remove('active');
}

// Mostrar seguidos
function showFollowing() {
    document.getElementById('following-screen').classList.add('active');
    loadFollowingList();
}

// Ocultar seguidos
function hideFollowing() {
    document.getElementById('following-screen').classList.remove('active');
}

// Cargar lista de seguidores
function loadFollowersList() {
    const followersList = document.getElementById('followers-list');
    followersList.innerHTML = '';
    
    if (followers.length === 0) {
        followersList.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">
                    <i class="fas fa-users"></i>
                </div>
                <div class="empty-title">No tienes seguidores</div>
                <div class="empty-subtitle">Comparte tu perfil para conseguir seguidores</div>
            </div>
        `;
    } else {
        followers.forEach(user => {
            const userItem = document.createElement('div');
            userItem.className = 'user-item';
            userItem.innerHTML = `
                <div class="user-avatar">
                    ${user.avatar !== '/default-avatar.png' ? 
                        `<img src="${user.avatar}" alt="${user.name}" onerror="this.style.display='none'">` : 
                        user.name.charAt(0).toUpperCase()
                    }
                    <div class="user-online-status" id="follower-online-${user.id}"></div>
                </div>
                <div class="user-info">
                    <div class="user-name">${user.name}</div>
                    <div class="user-bio-small">${user.bio}</div>
                </div>
            `;
            
            userItem.addEventListener('click', () => showOtherUserProfile(user.id));
            followersList.appendChild(userItem);
        });
    }
}

// Cargar lista de seguidos
function loadFollowingList() {
    const followingList = document.getElementById('following-list');
    followingList.innerHTML = '';
    
    if (following.length === 0) {
        followingList.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">
                    <i class="fas fa-user-plus"></i>
                </div>
                <div class="empty-title">No sigues a nadie</div>
                <div class="empty-subtitle">Encuentra usuarios interesantes para seguir</div>
            </div>
        `;
    } else {
        following.forEach(user => {
            const userItem = document.createElement('div');
            userItem.className = 'user-item';
            userItem.innerHTML = `
                <div class="user-avatar">
                    ${user.avatar !== '/default-avatar.png' ? 
                        `<img src="${user.avatar}" alt="${user.name}" onerror="this.style.display='none'">` : 
                        user.name.charAt(0).toUpperCase()
                    }
                    <div class="user-online-status" id="following-online-${user.id}"></div>
                </div>
                <div class="user-info">
                    <div class="user-name">${user.name}</div>
                    <div class="user-bio-small">${user.bio}</div>
                </div>
            `;
            
            userItem.addEventListener('click', () => showOtherUserProfile(user.id));
            followingList.appendChild(userItem);
        });
    }
}

// Mostrar seguidores de usuario
function showUserFollowers() {
    // Implementar lógica para mostrar seguidores del usuario
    alert('Mostrar seguidores de ' + currentProfileUser.name);
}

// Mostrar seguidos de usuario
function showUserFollowing() {
    // Implementar lógica para mostrar seguidos del usuario
    alert('Mostrar seguidos de ' + currentProfileUser.name);
}

// Previsualizar avatar
function previewAvatar(event) {
    const file = event.target.files[0];
    if (file) {
        newAvatarFile = file;
        const reader = new FileReader();
        reader.onload = function(e) {
            const preview = document.getElementById('avatar-preview');
            preview.src = e.target.result;
            preview.style.display = 'block';
        };
        reader.readAsDataURL(file);
    }
}

// Guardar mi perfil
async function saveMyProfile() {
    const newName = document.getElementById('edit-profile-name').value.trim();
    const newBio = document.getElementById('edit-profile-bio').value.trim();
    const newPassword = document.getElementById('edit-profile-password').value;
    
    if (!newName) {
        alert('El nombre no puede estar vacío');
        return;
    }
    
    const formData = new FormData();
    formData.append('name', newName);
    formData.append('bio', newBio || "¡Yo uso SecureChat!");
    
    if (newPassword) {
        formData.append('password', newPassword);
    }
    
    if (newAvatarFile) {
        formData.append('avatar', newAvatarFile);
    }
    
    try {
        const response = await fetch(`/api/profile/${currentUser.id}`, {
            method: 'PUT',
            body: formData
        });
        
        if (response.ok) {
            const data = await response.json();
            currentUser = data.user;
            localStorage.setItem('currentUser', JSON.stringify(currentUser));
            updateCurrentUserDisplay();
            updateMyProfileDisplay();
            hideEditProfile();
            alert('Perfil actualizado correctamente');
        } else {
            const error = await response.json();
            alert('Error: ' + error.error);
        }
    } catch (error) {
        console.error('Error guardando perfil:', error);
        alert('Error al guardar el perfil');
    }
}

// Eliminar cuenta
function deleteAccount() {
    if (confirm('¿Estás seguro de que quieres eliminar tu cuenta? Esta acción no se puede deshacer.')) {
        alert('Funcionalidad de eliminar cuenta - Pendiente de implementar');
    }
}

// Mostrar perfil de otro usuario
function showOtherUserProfile(userId) {
    const user = allUsers.find(u => u.id === userId);
    if (!user) return;
    
    currentProfileUser = user;
    
    document.getElementById('user-profile-name').textContent = user.name;
    document.getElementById('user-profile-bio').textContent = user.bio;
    updateAvatarDisplay('user-profile-avatar', user.avatar, user.name);
    
    // Actualizar estado en línea en el perfil
    const isOnline = onlineUsers.find(u => u.id === user.id);
    document.getElementById('user-profile-online-status').className = `online-status ${isOnline ? 'online' : ''}`;
    
    // Actualizar estadísticas del usuario
    document.getElementById('user-followers-count').textContent = '0';
    document.getElementById('user-following-count').textContent = '0';
    
    // Actualizar botón de seguir
    const isFollowing = following.some(u => u.id === user.id);
    const followBtn = document.getElementById('follow-btn');
    followBtn.textContent = isFollowing ? 'Dejar de seguir' : 'Seguir';
    followBtn.className = isFollowing ? 'follow-btn following' : 'follow-btn';
    
    document.getElementById('user-profile-screen').classList.add('active');
}

// Toggle seguir/dejar de seguir
function toggleFollow() {
    if (!currentProfileUser) return;
    
    const isFollowing = following.some(u => u.id === currentProfileUser.id);
    
    socket.emit('toggle_follow', {
        followerId: currentUser.id,
        followingId: currentProfileUser.id
    });
    
    // Actualizar UI inmediatamente
    const followBtn = document.getElementById('follow-btn');
    if (isFollowing) {
        // Dejar de seguir
        following = following.filter(u => u.id !== currentProfileUser.id);
        followBtn.textContent = 'Seguir';
        followBtn.className = 'follow-btn';
    } else {
        // Seguir
        const user = allUsers.find(u => u.id === currentProfileUser.id);
        if (user) following.push(user);
        followBtn.textContent = 'Dejar de seguir';
        followBtn.className = 'follow-btn following';
    }
    
    // Actualizar contadores
    updateFollowCounts();
}

// Ocultar perfil de usuario
function hideUserProfile() {
    document.getElementById('user-profile-screen').classList.remove('active');
    currentProfileUser = null;
}

// Actualizar display del avatar
function updateAvatarDisplay(elementId, avatarUrl, userName) {
    const element = document.getElementById(elementId);
    if (avatarUrl && avatarUrl !== '/default-avatar.png') {
        element.innerHTML = `<img src="${avatarUrl}" alt="${userName}" onerror="this.style.display='none'">`;
        // Si la imagen falla, mostrar la inicial
        const img = element.querySelector('img');
        img.onerror = function() {
            this.style.display = 'none';
            const fallback = document.createElement('div');
            fallback.textContent = userName.charAt(0).toUpperCase();
            fallback.style.display = 'flex';
            fallback.style.alignItems = 'center';
            fallback.style.justifyContent = 'center';
            fallback.style.width = '100%';
            fallback.style.height = '100%';
            element.appendChild(fallback);
        };
    } else {
        element.innerHTML = userName.charAt(0).toUpperCase();
    }
    
    // Agregar elementos adicionales según el tipo de avatar
    if (elementId === 'panel-user-avatar' || elementId === 'my-profile-avatar') {
        element.innerHTML += '<div class="online-status online"></div>';
    } else if (elementId === 'current-chat-avatar') {
        element.innerHTML += '<div class="online-status" id="current-chat-online-status"></div>';
    } else if (elementId === 'user-profile-avatar') {
        element.innerHTML += '<div class="online-status" id="user-profile-online-status"></div>';
    }
}

// Actualizar display del usuario actual
function updateCurrentUserDisplay() {
    document.getElementById('panel-user-name').textContent = currentUser.name;
    document.getElementById('panel-user-bio').textContent = currentUser.bio;
    updateAvatarDisplay('panel-user-avatar', currentUser.avatar, currentUser.name);
}

// Actualizar display de mi perfil
function updateMyProfileDisplay() {
    document.getElementById('my-profile-name').textContent = currentUser.name;
    document.getElementById('my-profile-bio').textContent = currentUser.bio;
    updateAvatarDisplay('my-profile-avatar', currentUser.avatar, currentUser.name);
    updateFollowCounts();
}

// Actualizar estado en línea de usuarios
function updateOnlineStatus() {
    // Limpiar todos los estados primero
    document.querySelectorAll('.online-status').forEach(status => {
        status.className = 'online-status';
    });
    
    document.querySelectorAll('.user-online-status').forEach(status => {
        status.className = 'user-online-status';
    });
    
    // Marcar usuarios en línea
    onlineUsers.forEach(user => {
        const userStatus = document.getElementById(`user-online-${user.id}`);
        const chatStatus = document.getElementById(`chat-online-${user.id}`);
        const followerStatus = document.getElementById(`follower-online-${user.id}`);
        const followingStatus = document.getElementById(`following-online-${user.id}`);
        
        if (userStatus) userStatus.classList.add('online');
        if (chatStatus) chatStatus.classList.add('online');
        if (followerStatus) followerStatus.classList.add('online');
        if (followingStatus) followingStatus.classList.add('online');
        
        // Actualizar estado en el chat actual
        if (selectedUser && selectedUser.id === user.id) {
            updateUserOnlineStatus(user);
        }
        
        // Actualizar estado en el perfil si está abierto
        const profileStatus = document.getElementById('user-profile-online-status');
        if (profileStatus && currentProfileUser && currentProfileUser.id === user.id) {
            profileStatus.classList.add('online');
        }
    });
}

// Actualizar badge de mensajes no leídos
function updateUnreadBadge(userId, count) {
    const badge = document.getElementById(`chat-unread-${userId}`);
    if (badge) {
        if (count > 0) {
            badge.textContent = count > 99 ? '99+' : count;
            badge.style.display = 'flex';
        } else {
            badge.style.display = 'none';
        }
    }
}

// Actualizar todos los badges
function updateUnreadBadges() {
    Object.keys(unreadCounts).forEach(userId => {
        updateUnreadBadge(userId, unreadCounts[userId]);
    });
}

// Cerrar sesión
function logout() {
    localStorage.removeItem('currentUser');
    window.location.href = '/';
}

// Función de debug para verificar el estado
function debugNavigation() {
    console.log('=== DEBUG NAVIGATION ===');
    console.log('Current User:', currentUser?.name);
    console.log('Selected User:', selectedUser?.name);
    console.log('All Users Count:', allUsers.length);
    console.log('Active Chats Count:', activeChats.length);
    console.log('Online Users Count:', onlineUsers.length);
    
    // Verificar elementos del DOM
    const usersTab = document.getElementById('users-tab');
    const chatTab = document.getElementById('chat-tab');
    const chatsTab = document.getElementById('chats-tab');
    
    console.log('Users Tab visible:', usersTab?.classList.contains('active'));
    console.log('Chat Tab visible:', chatTab?.classList.contains('active'));
    console.log('Chats Tab visible:', chatsTab?.classList.contains('active'));
}

// Agregar event listener para debug (temporal)
document.addEventListener('keydown', (e) => {
    if (e.key === 'd' && e.ctrlKey) {
        e.preventDefault();
        debugNavigation();
    }
});