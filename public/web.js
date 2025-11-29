// Variables globales
const socket = io();
let currentUser = null;
let selectedUser = null;
let selectedGroup = null;
let onlineUsers = [];
let allUsers = [];
let allGroups = [];
let activeChats = [];
let unreadCounts = {};
let newAvatarFile = null;
let newGroupAvatarFile = null;
let typingTimeouts = {};
let groupTypingTimeouts = {};
let userLastSeen = {};
let followers = [];
let following = [];
let currentProfileUser = null;
let currentProfileGroup = null;
let previousTab = 'chats';
let typingUsers = new Set();
let groupTypingUsers = new Map(); // Para controlar typing en grupos
let selectedMembers = new Set();
let sentMessageIds = new Set(); // Para prevenir duplicación de mensajes

// Inicializar la aplicación
document.addEventListener('DOMContentLoaded', async function() {
    currentUser = JSON.parse(localStorage.getItem('currentUser'));

    if (!currentUser) {
        window.location.href = '/';
        return;
    }

    if (!currentUser.bio) currentUser.bio = "¡Yo uso SecureChat!";
    if (!currentUser.avatar) currentUser.avatar = '/default-avatar.png';

    updateCurrentUserDisplay();
    showSkeletons();
    setupEventListeners();

    socket.emit('user_online', currentUser);
    await loadInitialData();
    socket.emit('get_unread_counts', currentUser.id);
    loadFollowData();
    showTab('chats');
});

// Configurar event listeners
function setupEventListeners() {
    // Botón hamburguesa y panel
    document.getElementById('menu-btn').addEventListener('click', () => togglePanel(true));
    document.getElementById('panel-overlay').addEventListener('click', () => togglePanel(false));
    document.getElementById('my-profile-btn').addEventListener('click', showMyProfile);
    document.getElementById('logout-btn').addEventListener('click', logout);

    // Navegación principal
    document.getElementById('fab-button').addEventListener('click', () => showTab('users'));
    document.getElementById('chat-back-btn').addEventListener('click', handleChatBack);
    document.getElementById('users-back-btn').addEventListener('click', () => showTab('chats'));

    // Grupos - Botones principales
    document.getElementById('new-group-btn').addEventListener('click', showCreateGroupScreen);

    // Perfiles - Hacer clickeables avatar y nombre en chat
    document.getElementById('current-chat-avatar').addEventListener('click', openCurrentProfile);
    document.getElementById('current-chat-name').addEventListener('click', openCurrentProfile);

    // Perfiles
    document.getElementById('my-profile-back-btn').addEventListener('click', hideMyProfile);
    document.getElementById('user-profile-back-btn').addEventListener('click', hideUserProfile);
    document.getElementById('group-profile-back-btn').addEventListener('click', hideGroupProfile);
    document.getElementById('edit-profile-btn').addEventListener('click', showEditProfile);
    document.getElementById('edit-profile-back-btn').addEventListener('click', hideEditProfile);
    document.getElementById('cancel-edit-btn').addEventListener('click', hideEditProfile);

    // Grupos - Edición
    document.getElementById('edit-group-btn').addEventListener('click', showEditGroupScreen);
    document.getElementById('edit-group-back-btn').addEventListener('click', hideEditGroupScreen);
    document.getElementById('cancel-edit-group-btn').addEventListener('click', hideEditGroupScreen);
    document.getElementById('save-group-btn').addEventListener('click', saveGroupChanges);

    // Grupos - Creación
    document.getElementById('create-group-back-btn').addEventListener('click', hideCreateGroupScreen);
    document.getElementById('cancel-create-group-btn').addEventListener('click', hideCreateGroupScreen);
    document.getElementById('add-members-btn').addEventListener('click', showSelectMembersScreen);
    document.getElementById('create-group-submit-btn').addEventListener('click', createGroup);

    // Grupos - Selección de miembros
    document.getElementById('select-members-back-btn').addEventListener('click', hideSelectMembersScreen);
    document.getElementById('confirm-members-btn').addEventListener('click', confirmMembersSelection);

    // Grupos - Unirse
    document.getElementById('confirm-join-group-btn').addEventListener('click', joinGroup);
    document.getElementById('cancel-join-group-btn').addEventListener('click', hideJoinGroupModal);
    document.getElementById('join-group-close-btn').addEventListener('click', hideJoinGroupModal);

    // Grupos - Salir
    document.getElementById('leave-group-btn').addEventListener('click', leaveGroup);

    // Seguidores/seguidos
    document.getElementById('followers-stat').addEventListener('click', showFollowers);
    document.getElementById('following-stat').addEventListener('click', showFollowing);
    document.getElementById('followers-back-btn').addEventListener('click', hideFollowers);
    document.getElementById('following-back-btn').addEventListener('click', hideFollowing);

    // Seguir/dejar de seguir
    document.getElementById('follow-btn').addEventListener('click', toggleFollow);
    document.getElementById('user-followers-stat').addEventListener('click', showUserFollowers);
    document.getElementById('user-following-stat').addEventListener('click', showUserFollowing);

    // Editar perfil
    document.getElementById('save-profile-btn').addEventListener('click', saveMyProfile);
    document.getElementById('delete-account-btn').addEventListener('click', deleteAccount);
    document.getElementById('avatar-input').addEventListener('change', previewAvatar);

    // Grupos - Avatares
    document.getElementById('group-avatar-input').addEventListener('change', previewGroupAvatar);
    document.getElementById('create-group-avatar').addEventListener('change', previewCreateGroupAvatar);

    // Mensajes - Enfocar input solo tras interacción
    document.getElementById('messages-container').addEventListener('click', focusMessageInput);
    document.getElementById('send-button').addEventListener('click', sendMessage);
    
    document.getElementById('message-input').addEventListener('keypress', function(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    document.getElementById('message-input').addEventListener('input', function() {
        this.style.height = 'auto';
        this.style.height = Math.min(this.scrollHeight, 120) + 'px';
        
        // Manejar estados de escritura
        handleTyping();
    });

    // Validación en tiempo real para formularios
    document.getElementById('create-group-name').addEventListener('input', validateGroupForm);
    document.getElementById('edit-group-name').addEventListener('input', validateEditGroupForm);

    // Tabs de selección de miembros
    document.querySelectorAll('.members-tab-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const tabName = this.dataset.tab;
            switchMembersTab(tabName);
        });
    });

    // Búsqueda de miembros
    document.getElementById('members-search-input').addEventListener('input', filterMembers);

    // Socket events
    socket.on('users_online', (users) => {
        onlineUsers = users;
        updateUserStatuses();
    });

    socket.on('all_users', (users) => {
        allUsers = users;
        loadUsers();
    });

    socket.on('all_groups', (groups) => {
        allGroups = groups;
        loadUsers();
    });

    socket.on('user_updated', (updatedUser) => {
        const userIndex = allUsers.findIndex(u => u.id === updatedUser.id);
        if (userIndex !== -1) {
            allUsers[userIndex] = updatedUser;
        }

        if (updatedUser.id === currentUser.id) {
            currentUser = updatedUser;
            localStorage.setItem('currentUser', JSON.stringify(currentUser));
            updateCurrentUserDisplay();
            updateMyProfileDisplay();
        }

        if (selectedUser && selectedUser.id === updatedUser.id) {
            selectedUser = updatedUser;
            document.getElementById('current-chat-name').textContent = updatedUser.name;
            updateAvatarDisplay('current-chat-avatar', updatedUser.avatar, updatedUser.name);
        }

        loadUsers();
        loadActiveChats();
    });

    socket.on('new_group_created', (group) => {
        allGroups.push(group);
        loadUsers();
        loadActiveChats();
    });

    socket.on('group_updated', (group) => {
        const groupIndex = allGroups.findIndex(g => g.id === group.id);
        if (groupIndex !== -1) {
            allGroups[groupIndex] = group;
        }

        if (currentProfileGroup && currentProfileGroup.id === group.id) {
            currentProfileGroup = group;
            updateGroupProfileDisplay();
        }

        if (selectedGroup && selectedGroup.id === group.id) {
            selectedGroup = group;
            document.getElementById('current-chat-name').textContent = group.name;
            updateGroupAvatarDisplay('current-chat-avatar', group.avatar, group.name);
        }

        loadUsers();
        loadActiveChats();
    });

    socket.on('user_joined_group', (data) => {
        console.log(`${data.user.name} se unió al grupo`);
        if (selectedGroup && selectedGroup.id === data.groupId) {
            addSystemMessage(`${data.user.name} se unió al grupo`);
        }
    });

    socket.on('user_left_group', (data) => {
        console.log(`${data.user.name} salió del grupo`);
        if (selectedGroup && selectedGroup.id === data.groupId) {
            addSystemMessage(`${data.user.name} salió del grupo`);
        }
    });

    socket.on('new_message', (messageData) => {
        console.log('Nuevo mensaje recibido:', messageData);
        handleNewMessage(messageData);
    });

    socket.on('new_group_message', (messageData) => {
        console.log('Nuevo mensaje grupal recibido:', messageData);
        handleNewGroupMessage(messageData);
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
        updateUserStatuses();
    });

    socket.on('user_typing', (data) => {
        if (data.from !== currentUser.id) {
            showTypingIndicator(data.from);
            
            typingUsers.add(data.from);
            updateChatsTypingStatus();
        }
    });

    socket.on('user_stop_typing', (data) => {
        if (data.from !== currentUser.id) {
            hideTypingIndicator(data.from);
            
            typingUsers.delete(data.from);
            updateChatsTypingStatus();
        }
    });

    // NUEVO: Estados de escritura grupal
    socket.on('group_typing', (data) => {
        if (data.from !== currentUser.id && selectedGroup && selectedGroup.id === data.groupId) {
            showGroupTypingIndicator(data.from);
        }
    });

    socket.on('group_stop_typing', (data) => {
        if (data.from !== currentUser.id && selectedGroup && selectedGroup.id === data.groupId) {
            hideGroupTypingIndicator(data.from);
        }
    });

    socket.on('follow_data', (data) => {
        followers = data.followers;
        following = data.following;
        updateFollowCounts();
    });

    socket.on('follow_updated', (data) => {
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
        loadFollowData();
    });

    socket.on('chats_updated', () => {
        console.log('Chats actualizados en tiempo real');
        loadActiveChats();
    });

    socket.on('message_sent', (messageData) => {
        console.log('Mensaje enviado confirmado:', messageData);
        // Remover de mensajes temporales si existe
        if (messageData.id && messageData.id.startsWith('temp-')) {
            const tempMessage = document.querySelector(`[data-message-id="${messageData.id}"]`);
            if (tempMessage) {
                tempMessage.remove();
            }
        }
    });

    socket.on('group_message_sent', (messageData) => {
        console.log('Mensaje grupal enviado confirmado:', messageData);
        // Remover de mensajes temporales si existe
        if (messageData.id && messageData.id.startsWith('temp-group-')) {
            const tempMessage = document.querySelector(`[data-message-id="${messageData.id}"]`);
            if (tempMessage) {
                tempMessage.remove();
            }
        }
    });
}

// FOCUS MEJORADO: Solo tras interacción explícita
function focusMessageInput() {
    const messageInput = document.getElementById('message-input');
    if (messageInput && !messageInput.matches(':focus')) {
        setTimeout(() => {
            messageInput.focus();
        }, 100);
    }
}

// CONTROL DE TYPING MEJORADO
function handleTyping() {
    if (selectedUser) {
        socket.emit('user_typing', {
            to: selectedUser,
            from: currentUser
        });

        clearTimeout(typingTimeouts['private']);
        typingTimeouts['private'] = setTimeout(() => {
            socket.emit('user_stop_typing', {
                to: selectedUser,
                from: currentUser
            });
        }, 1000);
    } else if (selectedGroup) {
        socket.emit('group_typing', {
            groupId: selectedGroup.id,
            from: currentUser
        });

        clearTimeout(typingTimeouts['group']);
        typingTimeouts['group'] = setTimeout(() => {
            socket.emit('group_stop_typing', {
                groupId: selectedGroup.id,
                from: currentUser
            });
        }, 1000);
    }
}

// Controlar panel lateral
function togglePanel(show) {
    const panel = document.getElementById('side-panel');
    const overlay = document.getElementById('panel-overlay');
    
    if (show === undefined) {
        panel.classList.toggle('active');
        overlay.classList.toggle('active');
    } else {
        if (show) {
            panel.classList.add('active');
            overlay.classList.add('active');
        } else {
            panel.classList.remove('active');
            overlay.classList.remove('active');
        }
    }
}

// MEJORADO: Prevenir duplicación de mensajes
function handleNewMessage(messageData) {
    console.log('Manejando nuevo mensaje:', messageData);
    
    // Verificar si el mensaje ya fue procesado
    if (sentMessageIds.has(messageData.id)) {
        console.log('Mensaje duplicado ignorado:', messageData.id);
        return;
    }
    
    sentMessageIds.add(messageData.id);
    
    // Limitar tamaño del cache de IDs
    if (sentMessageIds.size > 1000) {
        const firstId = Array.from(sentMessageIds)[0];
        sentMessageIds.delete(firstId);
    }

    const sender = allUsers.find(u => u.id === messageData.from);
    if (!sender) {
        console.log('Usuario remitente no encontrado');
        return;
    }

    if (selectedUser && selectedUser.id === messageData.from) {
        console.log('Agregando mensaje a la UI del chat actual');
        addMessageToUI(messageData);

        socket.emit('mark_as_read', {
            userId: currentUser.id,
            otherUserId: selectedUser.id
        });

        unreadCounts[selectedUser.id] = 0;
        updateUnreadBadge(selectedUser.id, 0);
    } else {
        console.log('Incrementando contador para usuario:', sender.name);
        unreadCounts[messageData.from] = (unreadCounts[messageData.from] || 0) + 1;
    }

    loadActiveChats();
}

// MEJORADO: Prevenir duplicación de mensajes grupales
function handleNewGroupMessage(messageData) {
    console.log('Manejando nuevo mensaje grupal:', messageData);
    
    // Verificar si el mensaje ya fue procesado
    if (sentMessageIds.has(messageData.id)) {
        console.log('Mensaje grupal duplicado ignorado:', messageData.id);
        return;
    }
    
    sentMessageIds.add(messageData.id);
    
    // Limitar tamaño del cache de IDs
    if (sentMessageIds.size > 1000) {
        const firstId = Array.from(sentMessageIds)[0];
        sentMessageIds.delete(firstId);
    }
    
    if (selectedGroup && selectedGroup.id === messageData.groupId) {
        console.log('Agregando mensaje grupal a la UI del chat actual');
        addGroupMessageToUI(messageData);

        socket.emit('mark_group_as_read', {
            userId: currentUser.id,
            groupId: selectedGroup.id
        });

        unreadCounts[selectedGroup.id] = 0;
        updateUnreadBadge(selectedGroup.id, 0);
    } else {
        console.log('Incrementando contador para grupo');
        unreadCounts[messageData.groupId] = (unreadCounts[messageData.groupId] || 0) + 1;
    }

    loadActiveChats();
}

// NUEVO: Estados de escritura grupal
function showGroupTypingIndicator(userId) {
    if (!selectedGroup) return;

    const user = allUsers.find(u => u.id === userId);
    if (!user) return;

    // Agregar usuario a la lista de typing
    groupTypingUsers.set(userId, user.name);

    updateGroupTypingStatus();

    // Limpiar timeout anterior
    if (groupTypingTimeouts[userId]) {
        clearTimeout(groupTypingTimeouts[userId]);
    }

    // Timeout para remover automáticamente
    groupTypingTimeouts[userId] = setTimeout(() => {
        hideGroupTypingIndicator(userId);
    }, 3000);
}

function hideGroupTypingIndicator(userId) {
    groupTypingUsers.delete(userId);
    updateGroupTypingStatus();
}

function updateGroupTypingStatus() {
    const statusElement = document.getElementById('current-chat-status');
    if (!statusElement) return;

    const typingCount = groupTypingUsers.size;

    if (typingCount === 0) {
        // Restaurar estado normal
        if (selectedGroup) {
            statusElement.textContent = `${selectedGroup.members.length} miembros`;
            statusElement.className = 'current-chat-status';
        }
    } else {
        // Mostrar estados de escritura
        const typingNames = Array.from(groupTypingUsers.values());
        let statusText = '';

        if (typingCount === 1) {
            statusText = `${typingNames[0]} está escribiendo...`;
        } else if (typingCount === 2) {
            statusText = `${typingNames[0]} y ${typingNames[1]} están escribiendo...`;
        } else {
            statusText = `${typingCount} personas están escribiendo...`;
        }

        statusElement.textContent = statusText;
        statusElement.className = 'current-chat-status typing';
    }
}

// Actualizar estado "escribiendo" en chats activos
function updateChatsTypingStatus() {
    const chatItems = document.querySelectorAll('.chat-item');
    chatItems.forEach(chatItem => {
        const userId = chatItem.dataset.userId;
        const lastMessageElement = chatItem.querySelector('.chat-last-message');
        
        if (userId && typingUsers.has(userId)) {
            lastMessageElement.textContent = 'escribiendo...';
            lastMessageElement.classList.add('typing');
        } else {
            const chat = activeChats.find(c => c.user && c.user.id === userId);
            if (chat && lastMessageElement) {
                lastMessageElement.textContent = chat.lastMessage || 'Haz clic para chatear';
                lastMessageElement.classList.remove('typing');
            }
        }
    });
}

// Mostrar skeletons de carga
function showSkeletons() {
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
    const chatsSkeleton = document.getElementById('chats-skeleton');
    const usersSkeleton = document.getElementById('users-skeleton');
    
    if (chatsSkeleton) chatsSkeleton.style.display = 'none';
    if (usersSkeleton) usersSkeleton.style.display = 'none';
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
        document.getElementById('user-followers-count').textContent = '0';
        document.getElementById('user-following-count').textContent = '0';
    }
}

// Cargar datos iniciales
async function loadInitialData() {
    try {
        await loadUsers();
        await loadActiveChats();
        socket.emit('get_all_groups');
    } catch (error) {
        console.error('Error cargando datos iniciales:', error);
    } finally {
        hideSkeletons();
    }
}

// Cargar lista de usuarios Y grupos
async function loadUsers() {
    try {
        const usersList = document.getElementById('users-list');
        const emptyState = document.getElementById('users-empty');

        const otherUsers = allUsers.filter(user => user.id !== currentUser.id);
        const publicGroups = allGroups.filter(group => group.isPublic);

        const totalItems = otherUsers.length + publicGroups.length;

        if (totalItems === 0) {
            usersList.style.display = 'none';
            emptyState.style.display = 'flex';
        } else {
            usersList.style.display = 'block';
            emptyState.style.display = 'none';

            usersList.innerHTML = '';

            // Mostrar grupos públicos primero
            publicGroups.forEach(group => {
                const isMember = group.members.includes(currentUser.id);
                const groupItem = document.createElement('div');
                groupItem.className = 'user-item';
                groupItem.dataset.groupId = group.id;

                // MEJORADO: Sin emojis, diseño limpio
                groupItem.innerHTML = `
                    <div class="user-avatar group-avatar">
                        ${group.avatar && group.avatar !== '/default-group-avatar.png' ? 
                            `<img src="${group.avatar}?v=${Date.now()}" alt="${group.name}" onerror="this.style.display='none'">` : 
                            `<div class="avatar-fallback">${group.name.charAt(0).toUpperCase()}</div>`
                        }
                    </div>
                    <div class="user-info">
                        <div class="user-name">${group.name}</div>
                        <div class="group-info">
                            <div class="group-members-count">${group.members.length} miembros</div>
                            ${!isMember ? '<div class="join-hint">Toca para unirte</div>' : ''}
                        </div>
                    </div>
                `;

                groupItem.addEventListener('click', (e) => {
                    // MEJORADO: Animación táctil
                    groupItem.style.transform = 'scale(0.98)';
                    setTimeout(() => {
                        groupItem.style.transform = '';
                    }, 150);

                    if (!isMember) {
                        showJoinGroupModal(group);
                    } else {
                        openGroupChat(group.id);
                    }
                });

                usersList.appendChild(groupItem);
            });

            // Mostrar usuarios
            otherUsers.forEach(user => {
                if (!user.bio) user.bio = "¡Yo uso SecureChat!";
                if (!user.avatar) user.avatar = '/default-avatar.png';

                const userItem = document.createElement('div');
                userItem.className = 'user-item';
                userItem.dataset.userId = user.id;

                const isOnline = onlineUsers.find(u => u.id === user.id);
                const statusText = isOnline ? 'En línea' : getLastSeenText(user.id);

                userItem.innerHTML = `
                    <div class="user-avatar">
                        ${user.avatar !== '/default-avatar.png' ? 
                            `<img src="${user.avatar}?v=${Date.now()}" alt="${user.name}" onerror="this.style.display='none'">` : 
                            `<div class="avatar-fallback">${user.name.charAt(0).toUpperCase()}</div>`
                        }
                    </div>
                    <div class="user-info">
                        <div class="user-name">${user.name}</div>
                        <div class="user-status ${isOnline ? 'online' : 'offline'}">${statusText}</div>
                    </div>
                `;

                userItem.addEventListener('click', (e) => {
                    // MEJORADO: Animación táctil
                    userItem.style.transform = 'scale(0.98)';
                    setTimeout(() => {
                        userItem.style.transform = '';
                    }, 150);

                    console.log('Iniciando chat con:', user.name);
                    startChat(user.id);
                });

                const avatarElement = userItem.querySelector('.user-avatar');
                avatarElement.addEventListener('click', (e) => {
                    e.stopPropagation();
                    console.log('Mostrando perfil de:', user.name);
                    showOtherUserProfile(user.id);
                });

                usersList.appendChild(userItem);
            });
        }
    } catch (error) {
        console.error('Error cargando usuarios:', error);
        hideSkeletons();
    }
}

// Obtener texto de última vez conectado
function getLastSeenText(userId) {
    const lastSeen = userLastSeen[userId];
    if (lastSeen) {
        const lastSeenTime = new Date(lastSeen);
        const now = new Date();
        const diffMinutes = Math.floor((now - lastSeenTime) / (1000 * 60));

        if (diffMinutes < 1) return 'Ahora mismo';
        if (diffMinutes < 60) return `Hace ${diffMinutes} min`;
        if (diffMinutes < 1440) return `Hace ${Math.floor(diffMinutes / 60)} h`;

        return `Últ. vez ${lastSeenTime.toLocaleDateString('es-ES')}`;
    }
    return 'Desconectado';
}

// Actualizar estados de usuarios en tiempo real
function updateUserStatuses() {
    const userItems = document.querySelectorAll('.user-item');
    userItems.forEach(item => {
        const userId = item.dataset.userId;
        if (userId) {
            const user = allUsers.find(u => u.id === userId);
            if (user) {
                const isOnline = onlineUsers.find(u => u.id === userId);
                const statusElement = item.querySelector('.user-status');
                const statusText = isOnline ? 'En línea' : getLastSeenText(userId);

                if (statusElement) {
                    statusElement.textContent = statusText;
                    statusElement.className = `user-status ${isOnline ? 'online' : 'offline'}`;
                }
            }
        }
    });

    if (selectedUser) {
        updateUserOnlineStatus(selectedUser);
    }
}

// Cargar chats activos - INCLUYENDO GRUPOS
async function loadActiveChats() {
    try {
        console.log('Cargando chats activos...');
        const response = await fetch(`/api/chats?userId=${currentUser.id}`);
        const chatsData = await response.json();

        console.log('Chats recibidos del servidor:', chatsData);
        activeChats = chatsData;

        renderActiveChats();
    } catch (error) {
        console.error('Error cargando chats:', error);
        hideSkeletons();
    }
}

// Renderizar chats activos en la UI
function renderActiveChats() {
    const chatsList = document.getElementById('chats-list');
    const emptyState = document.getElementById('chats-empty');

    console.log('Renderizando chats activos:', activeChats.length);

    if (activeChats.length === 0) {
        chatsList.style.display = 'none';
        emptyState.style.display = 'flex';
    } else {
        chatsList.style.display = 'block';
        emptyState.style.display = 'none';

        chatsList.innerHTML = '';
        activeChats.forEach(chat => {
            if (chat.type === 'private') {
                const unreadCount = unreadCounts[chat.user.id] || 0;
                const isTyping = typingUsers.has(chat.user.id);
                const lastMessage = isTyping ? 'escribiendo...' : (chat.lastMessage || 'Haz clic para chatear');
                
                const chatItem = document.createElement('div');
                chatItem.className = 'chat-item';
                chatItem.dataset.userId = chat.user.id;
                chatItem.innerHTML = `
                    <div class="chat-avatar">
                        ${chat.user.avatar !== '/default-avatar.png' ? 
                            `<img src="${chat.user.avatar}?v=${Date.now()}" alt="${chat.user.name}" onerror="this.style.display='none'">` : 
                            `<div class="avatar-fallback">${chat.user.name.charAt(0).toUpperCase()}</div>`
                        }
                    </div>
                    <div class="chat-info">
                        <div class="chat-name">${chat.user.name}</div>
                        <div class="chat-last-message ${isTyping ? 'typing' : ''}">${lastMessage}</div>
                    </div>
                    <div class="chat-time">${isTyping ? '' : (chat.lastTime || '')}</div>
                    ${unreadCount > 0 ? `<div class="unread-badge" id="chat-unread-${chat.user.id}">${unreadCount}</div>` : ''}
                `;

                chatItem.addEventListener('click', () => openChat(chat.user.id));

                const avatarElement = chatItem.querySelector('.chat-avatar');
                avatarElement.addEventListener('click', (e) => {
                    e.stopPropagation();
                    console.log('Mostrando perfil desde chats:', chat.user.name);
                    showOtherUserProfile(chat.user.id);
                });

                chatsList.appendChild(chatItem);
            } else if (chat.type === 'group') {
                const unreadCount = unreadCounts[chat.group.id] || 0;
                const lastMessage = chat.lastMessage || 'Grupo creado';
                
                const chatItem = document.createElement('div');
                chatItem.className = 'chat-item';
                chatItem.dataset.groupId = chat.group.id;
                chatItem.innerHTML = `
                    <div class="chat-avatar group-avatar">
                        ${chat.group.avatar && chat.group.avatar !== '/default-group-avatar.png' ? 
                            `<img src="${chat.group.avatar}?v=${Date.now()}" alt="${chat.group.name}" onerror="this.style.display='none'">` : 
                            `<div class="avatar-fallback">${chat.group.name.charAt(0).toUpperCase()}</div>`
                        }
                    </div>
                    <div class="chat-info">
                        <div class="chat-name">${chat.group.name}</div>
                        <div class="chat-last-message">${lastMessage}</div>
                    </div>
                    <div class="chat-time">${chat.lastTime || ''}</div>
                    ${unreadCount > 0 ? `<div class="unread-badge" id="chat-unread-${chat.group.id}">${unreadCount}</div>` : ''}
                `;

                chatItem.addEventListener('click', () => openGroupChat(chat.group.id));

                const avatarElement = chatItem.querySelector('.chat-avatar');
                avatarElement.addEventListener('click', (e) => {
                    e.stopPropagation();
                    console.log('Mostrando perfil de grupo desde chats:', chat.group.name);
                    showGroupProfile(chat.group.id);
                });

                chatsList.appendChild(chatItem);
            }
        });
    }

    hideSkeletons();
}

// Iniciar chat con un usuario
function startChat(userId) {
    console.log('Iniciando chat con usuario ID:', userId);
    const user = allUsers.find(u => u.id === userId);
    if (!user) {
        console.error('Usuario no encontrado');
        return;
    }

    openChat(userId);
}

// MEJORADO: Abrir chat sin auto-focus
function openChat(userId) {
    console.log('Abriendo chat con usuario ID:', userId);
    const user = allUsers.find(u => u.id === userId);
    if (!user) {
        console.error('Usuario no encontrado en openChat');
        return;
    }

    selectedUser = user;
    selectedGroup = null;

    // Limpiar estados de escritura grupal
    groupTypingUsers.clear();

    previousTab = document.getElementById('users-tab').classList.contains('active') ? 'users' : 'chats';

    showTab('chat');

    document.getElementById('current-chat-name').textContent = user.name;
    updateAvatarDisplay('current-chat-avatar', user.avatar, user.name);

    updateUserOnlineStatus(user);

    loadMessages(user);

    socket.emit('mark_as_read', {
        userId: currentUser.id,
        otherUserId: user.id
    });

    unreadCounts[user.id] = 0;
    updateUnreadBadge(user.id, 0);

    // MEJORADO: No enfocar automáticamente
    // El input se enfocará cuando el usuario toque el área del chat
}

// MEJORADO: Abrir chat de grupo sin auto-focus
function openGroupChat(groupId) {
    console.log('Abriendo chat de grupo ID:', groupId);
    const group = allGroups.find(g => g.id === groupId);
    if (!group) {
        console.error('Grupo no encontrado en openGroupChat');
        return;
    }

    selectedGroup = group;
    selectedUser = null;

    // Limpiar estados de escritura
    typingUsers.clear();

    previousTab = document.getElementById('users-tab').classList.contains('active') ? 'users' : 'chats';

    showTab('chat');

    document.getElementById('current-chat-name').textContent = group.name;
    updateGroupAvatarDisplay('current-chat-avatar', group.avatar, group.name);

    document.getElementById('current-chat-status').textContent = `${group.members.length} miembros`;
    document.getElementById('current-chat-status').className = 'current-chat-status';

    loadGroupMessages(group);

    socket.emit('mark_group_as_read', {
        userId: currentUser.id,
        groupId: group.id
    });

    unreadCounts[group.id] = 0;
    updateUnreadBadge(group.id, 0);

    // MEJORADO: No enfocar automáticamente
    // El input se enfocará cuando el usuario toque el área del chat
}

// NUEVO: Abrir perfil del chat actual
function openCurrentProfile() {
    if (selectedUser) {
        showOtherUserProfile(selectedUser.id);
    } else if (selectedGroup) {
        showGroupProfile(selectedGroup.id);
    }
}

// Manejar el botón de regresar en el chat
function handleChatBack() {
    showTab(previousTab);
    selectedUser = null;
    selectedGroup = null;
    
    // Limpiar estados de escritura
    typingUsers.clear();
    groupTypingUsers.clear();
}

// Actualizar estado en línea del usuario en el chat
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
}

// Cargar mensajes del chat privado
async function loadMessages(user) {
    try {
        console.log('Cargando mensajes para usuario:', user.name);
        const response = await fetch(`/api/messages/${currentUser.id}/${user.id}`);
        const messages = await response.json();

        console.log('Mensajes recibidos:', messages);

        const messagesContainer = document.getElementById('messages-container');
        messagesContainer.innerHTML = '';

        if (messages.length === 0) {
            messagesContainer.innerHTML = `
                <div class="empty-state" style="justify-content: center; height: 100%; display: flex; flex-direction: column;">
                    <div class="empty-icon">
                        <i class="fas fa-comments"></i>
                    </div>
                    <div class="empty-title">Inicia la conversación</div>
                    <div class="empty-subtitle">Envía el primer mensaje a ${user.name}</div>
                </div>
            `;
        } else {
            messages.forEach(message => {
                addMessageToUI(message);
            });
        }

        setTimeout(() => {
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }, 100);
    } catch (error) {
        console.error('Error cargando mensajes:', error);
        const messagesContainer = document.getElementById('messages-container');
        messagesContainer.innerHTML = `
            <div class="empty-state" style="justify-content: center; height: 100%; display: flex; flex-direction: column;">
                <div class="empty-icon">
                    <i class="fas fa-exclamation-triangle"></i>
                </div>
                <div class="empty-title">Error cargando mensajes</div>
                <div class="empty-subtitle">Intenta nuevamente</div>
            </div>
        `;
    }
}

// Cargar mensajes del grupo
async function loadGroupMessages(group) {
    try {
        console.log('Cargando mensajes para grupo:', group.name);
        const response = await fetch(`/api/group-messages/${group.id}`);
        const messages = await response.json();

        console.log('Mensajes grupales recibidos:', messages);

        const messagesContainer = document.getElementById('messages-container');
        messagesContainer.innerHTML = '';

        if (messages.length === 0) {
            messagesContainer.innerHTML = `
                <div class="empty-state" style="justify-content: center; height: 100%; display: flex; flex-direction: column;">
                    <div class="empty-icon">
                        <i class="fas fa-users"></i>
                    </div>
                    <div class="empty-title">Bienvenido al grupo</div>
                    <div class="empty-subtitle">Sé el primero en enviar un mensaje</div>
                </div>
            `;
        } else {
            messages.forEach(message => {
                addGroupMessageToUI(message);
            });
        }

        setTimeout(() => {
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }, 100);
    } catch (error) {
        console.error('Error cargando mensajes grupales:', error);
        const messagesContainer = document.getElementById('messages-container');
        messagesContainer.innerHTML = `
            <div class="empty-state" style="justify-content: center; height: 100%; display: flex; flex-direction: column;">
                <div class="empty-icon">
                    <i class="fas fa-exclamation-triangle"></i>
                </div>
                <div class="empty-title">Error cargando mensajes</div>
                <div class="empty-subtitle">Intenta nuevamente</div>
            </div>
        `;
    }
}

// MEJORADO: Enviar mensaje con mejor control de duplicados
async function sendMessage() {
    const messageInput = document.getElementById('message-input');
    const message = messageInput.value.trim();

    if (!message) {
        console.log('No hay mensaje para enviar');
        return;
    }

    // Generar ID temporal único
    const tempId = 'temp-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);

    if (selectedUser) {
        // Mensaje privado
        console.log('Enviando mensaje a:', selectedUser.name, 'Mensaje:', message);

        const tempMessageData = {
            id: tempId,
            from: currentUser.id,
            to: selectedUser.id,
            message: message,
            timestamp: new Date().toISOString(),
            read: false
        };

        addMessageToUI(tempMessageData);

        messageInput.value = '';
        messageInput.style.height = 'auto';

        socket.emit('private_message', {
            to: selectedUser,
            message: message,
            from: currentUser
        });

    } else if (selectedGroup) {
        // Mensaje grupal
        console.log('Enviando mensaje grupal a:', selectedGroup.name, 'Mensaje:', message);

        const tempMessageData = {
            id: tempId,
            type: 'group',
            from: currentUser.id,
            groupId: selectedGroup.id,
            message: message,
            timestamp: new Date().toISOString(),
            readBy: [currentUser.id]
        };

        addGroupMessageToUI(tempMessageData);

        messageInput.value = '';
        messageInput.style.height = 'auto';

        socket.emit('group_message', {
            groupId: selectedGroup.id,
            message: message,
            from: currentUser
        });
    }
}

// Agregar mensaje privado a la UI
function addMessageToUI(messageData) {
    const messagesContainer = document.getElementById('messages-container');

    const emptyState = messagesContainer.querySelector('.empty-state');
    if (emptyState) {
        emptyState.remove();
    }

    // Verificar si el mensaje ya existe
    const existingMessage = document.querySelector(`[data-message-id="${messageData.id}"]`);
    if (existingMessage) {
        console.log('Mensaje ya existe en UI:', messageData.id);
        return;
    }

    const messageDiv = document.createElement('div');

    const isSent = messageData.from === currentUser.id;
    messageDiv.className = `message ${isSent ? 'sent' : 'received'}`;
    messageDiv.dataset.messageId = messageData.id;

    const time = new Date(messageData.timestamp).toLocaleTimeString('es-ES', {
        hour: '2-digit',
        minute: '2-digit'
    });

    messageDiv.innerHTML = `
        <div class="message-content">${messageData.message}</div>
        <div class="message-time">${time}</div>
    `;

    messagesContainer.appendChild(messageDiv);

    setTimeout(() => {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }, 50);
}

// Agregar mensaje grupal a la UI
function addGroupMessageToUI(messageData) {
    const messagesContainer = document.getElementById('messages-container');

    const emptyState = messagesContainer.querySelector('.empty-state');
    if (emptyState) {
        emptyState.remove();
    }

    // Verificar si el mensaje ya existe
    const existingMessage = document.querySelector(`[data-message-id="${messageData.id}"]`);
    if (existingMessage) {
        console.log('Mensaje grupal ya existe en UI:', messageData.id);
        return;
    }

    const messageDiv = document.createElement('div');

    const isSent = messageData.from === currentUser.id;
    const sender = allUsers.find(u => u.id === messageData.from);
    const senderName = sender ? sender.name : 'Usuario';

    messageDiv.className = `message group-message ${isSent ? 'sent' : 'received'}`;
    messageDiv.dataset.messageId = messageData.id;

    const time = new Date(messageData.timestamp).toLocaleTimeString('es-ES', {
        hour: '2-digit',
        minute: '2-digit'
    });

    messageDiv.innerHTML = `
        ${!isSent ? `<div class="message-sender">${senderName}</div>` : ''}
        <div class="message-content">${messageData.message}</div>
        <div class="message-time">${time}</div>
    `;

    messagesContainer.appendChild(messageDiv);

    setTimeout(() => {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }, 50);
}

// Agregar mensaje del sistema (unirse/salir)
function addSystemMessage(text) {
    const messagesContainer = document.getElementById('messages-container');

    const messageDiv = document.createElement('div');
    messageDiv.className = 'message system-message';
    messageDiv.style.alignSelf = 'center';
    messageDiv.style.background = 'rgba(255, 255, 255, 0.1)';
    messageDiv.style.color = 'var(--text-secondary)';
    messageDiv.style.fontSize = '0.8em';
    messageDiv.style.padding = '8px 12px';
    messageDiv.style.margin = '8px 0';

    messageDiv.innerHTML = text;

    messagesContainer.appendChild(messageDiv);

    setTimeout(() => {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }, 50);
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

    const statusElement = document.getElementById('current-chat-status');
    statusElement.textContent = 'escribiendo...';
    statusElement.className = 'current-chat-status typing';

    if (typingTimeouts[userId]) {
        clearTimeout(typingTimeouts[userId]);
    }

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

    if (selectedUser && selectedUser.id === userId) {
        updateUserOnlineStatus(selectedUser);
    }
}

// Función para cambiar pestañas
function showTab(tabName) {
    console.log('Cambiando a pestaña:', tabName);

    document.querySelectorAll('.tab-content, .users-tab-content, .profile-screen, .follow-screen, .edit-profile-screen, .edit-group-screen, .create-group-screen, .select-members-screen').forEach(element => {
        element.classList.remove('active');
    });

    if (tabName === 'users') {
        document.getElementById('users-tab').classList.add('active');
        previousTab = 'users';
    } else if (tabName === 'chat') {
        document.getElementById('chat-tab').classList.add('active');
    } else {
        document.getElementById('chats-tab').classList.add('active');
        previousTab = 'chats';
    }

    togglePanel(false);

    const fabButton = document.getElementById('fab-button');
    if (fabButton) {
        if (tabName === 'chats') {
            fabButton.style.display = 'flex';
        } else {
            fabButton.style.display = 'none';
        }
    }
}

// NUEVO: Validación de formularios en tiempo real
function validateGroupForm() {
    const name = document.getElementById('create-group-name').value.trim();
    const submitBtn = document.getElementById('create-group-submit-btn');
    
    if (name.length < 2) {
        submitBtn.disabled = true;
        submitBtn.style.opacity = '0.6';
    } else {
        submitBtn.disabled = false;
        submitBtn.style.opacity = '1';
    }
}

function validateEditGroupForm() {
    const name = document.getElementById('edit-group-name').value.trim();
    const submitBtn = document.getElementById('save-group-btn');
    
    if (name.length < 2) {
        submitBtn.disabled = true;
        submitBtn.style.opacity = '0.6';
    } else {
        submitBtn.disabled = false;
        submitBtn.style.opacity = '1';
    }
}

// GRUPOS - Funcionalidades de pantalla
function showCreateGroupScreen() {
    document.getElementById('create-group-screen').classList.add('active');
    selectedMembers.clear();
    updateSelectedMembersList();
    validateGroupForm(); // Validación inicial
}

function hideCreateGroupScreen() {
    document.getElementById('create-group-screen').classList.remove('active');
}

function showSelectMembersScreen() {
    document.getElementById('select-members-screen').classList.add('active');
    loadMembersForSelection();
}

function hideSelectMembersScreen() {
    document.getElementById('select-members-screen').classList.remove('active');
}

function showEditGroupScreen() {
    if (!currentProfileGroup) return;
    
    document.getElementById('edit-group-screen').classList.add('active');
    document.getElementById('edit-group-name').value = currentProfileGroup.name;
    document.getElementById('edit-group-description').value = currentProfileGroup.description;
    document.getElementById('group-avatar-preview').style.display = 'none';
    newGroupAvatarFile = null;
    validateEditGroupForm(); // Validación inicial
}

function hideEditGroupScreen() {
    document.getElementById('edit-group-screen').classList.remove('active');
}

function showJoinGroupModal(group) {
    currentProfileGroup = group;
    
    document.getElementById('join-group-name').textContent = group.name;
    document.getElementById('join-group-description').textContent = group.description;
    document.getElementById('join-group-members-count').textContent = group.members.length;
    
    updateGroupAvatarDisplay('join-group-avatar', group.avatar, group.name);
    
    document.getElementById('join-group-modal').classList.add('active');
}

function hideJoinGroupModal() {
    document.getElementById('join-group-modal').classList.remove('active');
    currentProfileGroup = null;
}

// GRUPOS - Selección de miembros
function switchMembersTab(tabName) {
    document.querySelectorAll('.members-tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    document.querySelectorAll('.members-tab-content').forEach(content => {
        content.classList.remove('active');
    });
    
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
    document.getElementById(`${tabName}-members-tab`).classList.add('active');
}

function loadMembersForSelection() {
    loadChatsMembers();
    loadAllMembers();
}

function loadChatsMembers() {
    const container = document.getElementById('chats-members-list');
    container.innerHTML = '';
    
    const usersWithChats = activeChats
        .filter(chat => chat.type === 'private')
        .map(chat => chat.user);
    
    if (usersWithChats.length === 0) {
        container.innerHTML = '<div class="empty-state" style="padding: 20px;"><div>No tienes chats activos</div></div>';
        return;
    }
    
    usersWithChats.forEach(user => {
        const memberItem = createMemberSelectItem(user);
        container.appendChild(memberItem);
    });
}

function loadAllMembers() {
    const container = document.getElementById('all-members-list');
    container.innerHTML = '';
    
    const otherUsers = allUsers.filter(user => user.id !== currentUser.id);
    
    if (otherUsers.length === 0) {
        container.innerHTML = '<div class="empty-state" style="padding: 20px;"><div>No hay otros usuarios</div></div>';
        return;
    }
    
    otherUsers.forEach(user => {
        const memberItem = createMemberSelectItem(user);
        container.appendChild(memberItem);
    });
}

function createMemberSelectItem(user) {
    const memberItem = document.createElement('div');
    memberItem.className = 'member-select-item';
    memberItem.dataset.userId = user.id;
    
    const isSelected = selectedMembers.has(user.id);
    
    memberItem.innerHTML = `
        <div class="member-select-checkbox"></div>
        <div class="user-avatar" style="width: 40px; height: 40px; margin-right: 12px;">
            ${user.avatar !== '/default-avatar.png' ? 
                `<img src="${user.avatar}?v=${Date.now()}" alt="${user.name}" onerror="this.style.display='none'">` : 
                `<div class="avatar-fallback">${user.name.charAt(0).toUpperCase()}</div>`
            }
        </div>
        <div class="user-info">
            <div class="user-name">${user.name}</div>
            <div class="user-status">${user.bio}</div>
        </div>
    `;
    
    if (isSelected) {
        memberItem.classList.add('selected');
    }
    
    memberItem.addEventListener('click', () => {
        toggleMemberSelection(user.id);
    });
    
    return memberItem;
}

function toggleMemberSelection(userId) {
    if (selectedMembers.has(userId)) {
        selectedMembers.delete(userId);
    } else {
        selectedMembers.add(userId);
    }
    
    document.querySelectorAll(`.member-select-item[data-user-id="${userId}"]`).forEach(item => {
        item.classList.toggle('selected');
    });
    
    updateSelectedMembersCount();
}

function filterMembers() {
    const searchTerm = document.getElementById('members-search-input').value.toLowerCase();
    
    document.querySelectorAll('.member-select-item').forEach(item => {
        const userName = item.querySelector('.user-name').textContent.toLowerCase();
        if (userName.includes(searchTerm)) {
            item.style.display = 'flex';
        } else {
            item.style.display = 'none';
        }
    });
}

function updateSelectedMembersCount() {
    const count = selectedMembers.size;
    document.getElementById('selected-members-count').textContent = `${count} miembros seleccionados`;
}

function updateSelectedMembersList() {
    const container = document.getElementById('selected-members-list');
    container.innerHTML = '';
    
    selectedMembers.forEach(userId => {
        const user = allUsers.find(u => u.id === userId);
        if (user) {
            const selectedMember = document.createElement('div');
            selectedMember.className = 'selected-member';
            selectedMember.innerHTML = `
                ${user.name}
                <button class="remove-member" data-user-id="${userId}">
                    <i class="fas fa-times"></i>
                </button>
            `;
            
            container.appendChild(selectedMember);
        }
    });
    
    // Agregar event listeners a los botones de eliminar
    container.querySelectorAll('.remove-member').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const userId = btn.dataset.userId;
            selectedMembers.delete(userId);
            updateSelectedMembersList();
            updateSelectedMembersCount();
            
            // Actualizar checkboxes
            document.querySelectorAll(`.member-select-item[data-user-id="${userId}"]`).forEach(item => {
                item.classList.remove('selected');
            });
        });
    });
}

function confirmMembersSelection() {
    updateSelectedMembersList();
    hideSelectMembersScreen();
}

// GRUPOS - Acciones
async function createGroup() {
    const name = document.getElementById('create-group-name').value.trim();
    const description = document.getElementById('create-group-description').value.trim();
    
    if (!name) {
        alert('El nombre del grupo es obligatorio');
        return;
    }
    
    // Mostrar loading
    const submitBtn = document.getElementById('create-group-submit-btn');
    const originalText = submitBtn.innerHTML;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creando...';
    submitBtn.disabled = true;
    
    const formData = new FormData();
    formData.append('name', name);
    formData.append('description', description);
    formData.append('creatorId', currentUser.id);
    formData.append('creatorName', currentUser.name);
    formData.append('members', JSON.stringify(Array.from(selectedMembers)));
    
    if (newGroupAvatarFile) {
        formData.append('avatar', newGroupAvatarFile);
    }
    
    try {
        const response = await fetch('/api/groups', {
            method: 'POST',
            body: formData
        });
        
        if (response.ok) {
            const data = await response.json();
            console.log('Grupo creado:', data.group);
            
            // Feedback de éxito
            submitBtn.innerHTML = '<i class="fas fa-check"></i> ¡Creado!';
            setTimeout(() => {
                hideCreateGroupScreen();
                selectedMembers.clear();
                
                // Abrir el grupo recién creado
                openGroupChat(data.group.id);
            }, 1000);
            
        } else {
            const error = await response.json();
            alert('Error: ' + error.error);
            submitBtn.innerHTML = originalText;
            submitBtn.disabled = false;
        }
    } catch (error) {
        console.error('Error creando grupo:', error);
        alert('Error al crear el grupo');
        submitBtn.innerHTML = originalText;
        submitBtn.disabled = false;
    }
}

async function joinGroup() {
    if (!currentProfileGroup) return;
    
    // Mostrar loading
    const joinBtn = document.getElementById('confirm-join-group-btn');
    const originalText = joinBtn.innerHTML;
    joinBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Uniendo...';
    joinBtn.disabled = true;
    
    try {
        const response = await fetch(`/api/groups/${currentProfileGroup.id}/join`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                userId: currentUser.id
            })
        });
        
        if (response.ok) {
            const data = await response.json();
            console.log('Unido al grupo:', data.group);
            
            // Feedback de éxito
            joinBtn.innerHTML = '<i class="fas fa-check"></i> ¡Unido!';
            setTimeout(() => {
                hideJoinGroupModal();
                
                // Abrir el grupo
                openGroupChat(currentProfileGroup.id);
            }, 1000);
            
        } else {
            const error = await response.json();
            alert('Error: ' + error.error);
            joinBtn.innerHTML = originalText;
            joinBtn.disabled = false;
        }
    } catch (error) {
        console.error('Error uniéndose al grupo:', error);
        alert('Error al unirse al grupo');
        joinBtn.innerHTML = originalText;
        joinBtn.disabled = false;
    }
}

async function leaveGroup() {
    if (!currentProfileGroup) return;
    
    if (!confirm('¿Estás seguro de que quieres salir de este grupo?')) {
        return;
    }
    
    // Mostrar loading
    const leaveBtn = document.getElementById('leave-group-btn');
    const originalText = leaveBtn.innerHTML;
    leaveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saliendo...';
    leaveBtn.disabled = true;
    
    try {
        const response = await fetch(`/api/groups/${currentProfileGroup.id}/leave`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                userId: currentUser.id
            })
        });
        
        if (response.ok) {
            console.log('Salido del grupo');
            
            // Feedback de éxito
            leaveBtn.innerHTML = '<i class="fas fa-check"></i> ¡Salido!';
            setTimeout(() => {
                hideGroupProfile();
                
                // Si estábamos en el chat del grupo, regresar a chats
                if (selectedGroup && selectedGroup.id === currentProfileGroup.id) {
                    showTab('chats');
                    selectedGroup = null;
                }
                
                // Recargar datos
                socket.emit('get_all_groups');
                loadActiveChats();
            }, 1000);
            
        } else {
            const error = await response.json();
            alert('Error: ' + error.error);
            leaveBtn.innerHTML = originalText;
            leaveBtn.disabled = false;
        }
    } catch (error) {
        console.error('Error saliendo del grupo:', error);
        alert('Error al salir del grupo');
        leaveBtn.innerHTML = originalText;
        leaveBtn.disabled = false;
    }
}

async function saveGroupChanges() {
    if (!currentProfileGroup) return;
    
    const name = document.getElementById('edit-group-name').value.trim();
    const description = document.getElementById('edit-group-description').value.trim();
    
    if (!name) {
        alert('El nombre del grupo es obligatorio');
        return;
    }
    
    // Mostrar loading
    const saveBtn = document.getElementById('save-group-btn');
    const originalText = saveBtn.innerHTML;
    saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';
    saveBtn.disabled = true;
    
    const formData = new FormData();
    formData.append('name', name);
    formData.append('description', description);
    formData.append('userId', currentUser.id);
    
    if (newGroupAvatarFile) {
        formData.append('avatar', newGroupAvatarFile);
    }
    
    try {
        const response = await fetch(`/api/groups/${currentProfileGroup.id}`, {
            method: 'PUT',
            body: formData
        });
        
        if (response.ok) {
            const data = await response.json();
            console.log('Grupo actualizado:', data.group);
            
            // Feedback de éxito
            saveBtn.innerHTML = '<i class="fas fa-check"></i> ¡Guardado!';
            setTimeout(() => {
                hideEditGroupScreen();
            }, 1000);
            
        } else {
            const error = await response.json();
            alert('Error: ' + error.error);
            saveBtn.innerHTML = originalText;
            saveBtn.disabled = false;
        }
    } catch (error) {
        console.error('Error actualizando grupo:', error);
        alert('Error al actualizar el grupo');
        saveBtn.innerHTML = originalText;
        saveBtn.disabled = false;
    }
}

// GRUPOS - Perfiles
function showGroupProfile(groupId) {
    const group = allGroups.find(g => g.id === groupId);
    if (!group) {
        console.error('Grupo no encontrado para perfil');
        return;
    }

    currentProfileGroup = group;
    updateGroupProfileDisplay();

    document.getElementById('group-profile-screen').classList.add('active');
}

function updateGroupProfileDisplay() {
    if (!currentProfileGroup) return;

    document.getElementById('group-profile-name').textContent = currentProfileGroup.name;
    document.getElementById('group-profile-description').textContent = currentProfileGroup.description;
    document.getElementById('group-members-count').textContent = currentProfileGroup.members.length;
    
    updateGroupAvatarDisplay('group-profile-avatar', currentProfileGroup.avatar, currentProfileGroup.name);

    // Mostrar/ocultar botón de edición (solo para admin)
    const isAdmin = currentProfileGroup.creatorId === currentUser.id;
    document.getElementById('group-admin-actions').style.display = isAdmin ? 'flex' : 'none';

    // Actualizar lista de miembros
    updateGroupMembersList();
}

function updateGroupMembersList() {
    const container = document.getElementById('group-members-list');
    container.innerHTML = '';

    currentProfileGroup.members.forEach(memberId => {
        const user = allUsers.find(u => u.id === memberId);
        if (user) {
            const isOnline = onlineUsers.find(u => u.id === user.id);
            const isAdmin = memberId === currentProfileGroup.creatorId;
            
            const memberItem = document.createElement('div');
            memberItem.className = `member-item ${isAdmin ? 'admin' : ''}`;
            
            memberItem.innerHTML = `
                <div class="member-avatar">
                    ${user.avatar !== '/default-avatar.png' ? 
                        `<img src="${user.avatar}?v=${Date.now()}" alt="${user.name}" onerror="this.style.display='none'">` : 
                        `<div class="avatar-fallback">${user.name.charAt(0).toUpperCase()}</div>`
                    }
                </div>
                <div class="member-info">
                    <div class="member-name">${user.name}${isAdmin ? ' (Admin)' : ''}</div>
                    <div class="member-status ${isOnline ? 'online' : ''}">
                        ${isOnline ? 'En línea' : 'Desconectado'}
                    </div>
                </div>
            `;

            // Solo el admin puede eliminar miembros (excepto a sí mismo)
            const isCurrentUserAdmin = currentProfileGroup.creatorId === currentUser.id;
            if (isCurrentUserAdmin && memberId !== currentUser.id) {
                memberItem.style.cursor = 'pointer';
                memberItem.title = `Eliminar a ${user.name} del grupo`;
                memberItem.addEventListener('click', () => {
                    if (confirm(`¿Eliminar a ${user.name} del grupo?`)) {
                        removeMemberFromGroup(memberId);
                    }
                });
            }

            container.appendChild(memberItem);
        }
    });
}

async function removeMemberFromGroup(memberId) {
    if (!currentProfileGroup) return;

    // Mostrar loading
    const memberItem = document.querySelector(`.member-item[data-user-id="${memberId}"]`);
    if (memberItem) {
        memberItem.style.opacity = '0.5';
    }

    try {
        const response = await fetch(`/api/groups/${currentProfileGroup.id}/members/${memberId}`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                adminId: currentUser.id
            })
        });

        if (response.ok) {
            console.log('Miembro eliminado del grupo');
            // La actualización se manejará via socket
        } else {
            const error = await response.json();
            alert('Error: ' + error.error);
            if (memberItem) {
                memberItem.style.opacity = '1';
            }
        }
    } catch (error) {
        console.error('Error eliminando miembro:', error);
        alert('Error al eliminar miembro');
        if (memberItem) {
            memberItem.style.opacity = '1';
        }
    }
}

function hideGroupProfile() {
    document.getElementById('group-profile-screen').classList.remove('active');
    currentProfileGroup = null;
}

// GRUPOS - Preview de avatares
function previewGroupAvatar(event) {
    const file = event.target.files[0];
    if (file) {
        newGroupAvatarFile = file;
        const reader = new FileReader();
        reader.onload = function(e) {
            const preview = document.getElementById('group-avatar-preview');
            preview.src = e.target.result;
            preview.style.display = 'block';
        };
        reader.readAsDataURL(file);
    }
}

function previewCreateGroupAvatar(event) {
    const file = event.target.files[0];
    if (file) {
        newGroupAvatarFile = file;
        const reader = new FileReader();
        reader.onload = function(e) {
            const preview = document.getElementById('create-group-avatar-preview');
            preview.src = e.target.result;
            preview.style.display = 'block';
        };
        reader.readAsDataURL(file);
    }
}

// MEJORADO: Display de avatares con cache busting
function updateGroupAvatarDisplay(elementId, avatarUrl, groupName) {
    const element = document.getElementById(elementId);
    const timestamp = Date.now();
    
    if (avatarUrl && avatarUrl !== '/default-group-avatar.png') {
        element.innerHTML = `
            <img src="${avatarUrl}?v=${timestamp}" alt="${groupName}" onerror="this.style.display='none'">
        `;
        const img = element.querySelector('img');
        img.onerror = function() {
            this.style.display = 'none';
            const fallback = document.createElement('div');
            fallback.className = 'avatar-fallback';
            fallback.textContent = groupName.charAt(0).toUpperCase();
            fallback.style.display = 'flex';
            fallback.style.alignItems = 'center';
            fallback.style.justifyContent = 'center';
            fallback.style.width = '100%';
            fallback.style.height = '100%';
            element.appendChild(fallback);
        };
    } else {
        element.innerHTML = `
            <div class="avatar-fallback">${groupName.charAt(0).toUpperCase()}</div>
        `;
    }
}

function updateAvatarDisplay(elementId, avatarUrl, userName) {
    const element = document.getElementById(elementId);
    const timestamp = Date.now();
    
    if (avatarUrl && avatarUrl !== '/default-avatar.png') {
        element.innerHTML = `<img src="${avatarUrl}?v=${timestamp}" alt="${userName}" onerror="this.style.display='none'">`;
        const img = element.querySelector('img');
        img.onerror = function() {
            this.style.display = 'none';
            const fallback = document.createElement('div');
            fallback.className = 'avatar-fallback';
            fallback.textContent = userName.charAt(0).toUpperCase();
            fallback.style.display = 'flex';
            fallback.style.alignItems = 'center';
            fallback.style.justifyContent = 'center';
            fallback.style.width = '100%';
            fallback.style.height = '100%';
            element.appendChild(fallback);
        };
    } else {
        element.innerHTML = `<div class="avatar-fallback">${userName.charAt(0).toUpperCase()}</div>`;
    }
}

// Funciones existentes (se mantienen igual)
function showMyProfile() {
    document.getElementById('my-profile-screen').classList.add('active');
    updateMyProfileDisplay();
    togglePanel(false);
}

function hideMyProfile() {
    document.getElementById('my-profile-screen').classList.remove('active');
}

function showEditProfile() {
    document.getElementById('edit-profile-screen').classList.add('active');
    document.getElementById('edit-profile-name').value = currentUser.name;
    document.getElementById('edit-profile-bio').value = currentUser.bio;
    document.getElementById('edit-profile-password').value = '';
    document.getElementById('avatar-preview').style.display = 'none';
    newAvatarFile = null;
}

function hideEditProfile() {
    document.getElementById('edit-profile-screen').classList.remove('active');
}

function showFollowers() {
    document.getElementById('followers-screen').classList.add('active');
    loadFollowersList();
}

function hideFollowers() {
    document.getElementById('followers-screen').classList.remove('active');
}

function showFollowing() {
    document.getElementById('following-screen').classList.add('active');
    loadFollowingList();
}

function hideFollowing() {
    document.getElementById('following-screen').classList.remove('active');
}

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
                        `<img src="${user.avatar}?v=${Date.now()}" alt="${user.name}" onerror="this.style.display='none'">` : 
                        `<div class="avatar-fallback">${user.name.charAt(0).toUpperCase()}</div>`
                    }
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
                        `<img src="${user.avatar}?v=${Date.now()}" alt="${user.name}" onerror="this.style.display='none'">` : 
                        `<div class="avatar-fallback">${user.name.charAt(0).toUpperCase()}</div>`
                    }
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

function showUserFollowers() {
    alert('Mostrar seguidores de ' + currentProfileUser.name);
}

function showUserFollowing() {
    alert('Mostrar seguidos de ' + currentProfileUser.name);
}

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

async function saveMyProfile() {
    const newName = document.getElementById('edit-profile-name').value.trim();
    const newBio = document.getElementById('edit-profile-bio').value.trim();
    const newPassword = document.getElementById('edit-profile-password').value;

    if (!newName) {
        alert('El nombre no puede estar vacío');
        return;
    }

    // Mostrar loading
    const saveBtn = document.getElementById('save-profile-btn');
    const originalText = saveBtn.innerHTML;
    saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';
    saveBtn.disabled = true;

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
            
            // Feedback de éxito
            saveBtn.innerHTML = '<i class="fas fa-check"></i> ¡Guardado!';
            setTimeout(() => {
                updateCurrentUserDisplay();
                updateMyProfileDisplay();
                hideEditProfile();
            }, 1000);
            
        } else {
            const error = await response.json();
            alert('Error: ' + error.error);
            saveBtn.innerHTML = originalText;
            saveBtn.disabled = false;
        }
    } catch (error) {
        console.error('Error guardando perfil:', error);
        alert('Error al guardar el perfil');
        saveBtn.innerHTML = originalText;
        saveBtn.disabled = false;
    }
}

function deleteAccount() {
    if (confirm('¿Estás seguro de que quieres eliminar tu cuenta? Esta acción no se puede deshacer.')) {
        alert('Funcionalidad de eliminar cuenta - Pendiente de implementar');
    }
}

function showOtherUserProfile(userId) {
    console.log('Mostrando perfil de usuario ID:', userId);
    const user = allUsers.find(u => u.id === userId);
    if (!user) {
        console.error('Usuario no encontrado para perfil');
        return;
    }

    currentProfileUser = user;

    document.getElementById('user-profile-name').textContent = user.name;
    document.getElementById('user-profile-bio').textContent = user.bio;
    updateAvatarDisplay('user-profile-avatar', user.avatar, user.name);

    const isOnline = onlineUsers.find(u => u.id === user.id);
    document.getElementById('user-profile-online-status').className = `online-status ${isOnline ? 'online' : ''}`;

    document.getElementById('user-followers-count').textContent = '0';
    document.getElementById('user-following-count').textContent = '0';

    const isFollowing = following.some(u => u.id === user.id);
    const followBtn = document.getElementById('follow-btn');
    followBtn.textContent = isFollowing ? 'Dejar de seguir' : 'Seguir';
    followBtn.className = isFollowing ? 'follow-btn following' : 'follow-btn';

    document.getElementById('user-profile-screen').classList.add('active');
}

function toggleFollow() {
    if (!currentProfileUser) return;

    const isFollowing = following.some(u => u.id === currentProfileUser.id);

    socket.emit('toggle_follow', {
        followerId: currentUser.id,
        followingId: currentProfileUser.id
    });

    const followBtn = document.getElementById('follow-btn');
    if (isFollowing) {
        following = following.filter(u => u.id !== currentProfileUser.id);
        followBtn.textContent = 'Seguir';
        followBtn.className = 'follow-btn';
    } else {
        const user = allUsers.find(u => u.id === currentProfileUser.id);
        if (user) following.push(user);
        followBtn.textContent = 'Dejar de seguir';
        followBtn.className = 'follow-btn following';
    }

    updateFollowCounts();
}

function hideUserProfile() {
    document.getElementById('user-profile-screen').classList.remove('active');
    currentProfileUser = null;
}

function updateCurrentUserDisplay() {
    document.getElementById('panel-user-name').textContent = currentUser.name;
    document.getElementById('panel-user-bio').textContent = currentUser.bio;
    updateAvatarDisplay('panel-user-avatar', currentUser.avatar, currentUser.name);
}

function updateMyProfileDisplay() {
    document.getElementById('my-profile-name').textContent = currentUser.name;
    document.getElementById('my-profile-bio').textContent = currentUser.bio;
    updateAvatarDisplay('my-profile-avatar', currentUser.avatar, currentUser.name);
    updateFollowCounts();
}

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

function updateUnreadBadges() {
    Object.keys(unreadCounts).forEach(userId => {
        updateUnreadBadge(userId, unreadCounts[userId]);
    });
}

function logout() {
    localStorage.removeItem('currentUser');
    window.location.href = '/';
}