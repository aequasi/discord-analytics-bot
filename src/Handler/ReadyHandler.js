import MessageReceiveEvent from "../Model/MessageReceiveEvent";
import UserBannedEvent from "../Model/UserBannedEvent";
import UserJoinedEvent from "../Model/UserJoinedEvent";
import UserLeftEvent from "../Model/UserLeftEvent";
import VoiceEvent from "../Model/VoiceEvent";

const voiceEvents = [];

export default class ReadyHandler {
    static run(callback) {
        this.client.on('ready', () => {
            console.log("Bot ready!");
            console.log(`To add me to a server, visit: https://discordapp.com/api/oauth2/authorize?client_id=${this.client.user.id}&scope=bot`);
            console.log(`Currently a member of ${this.client.guilds.size} guilds`);
            
            this.client.editStatus('online', {name: `Help: /help`});
            
            callback();
        });
        
        this.client.on("messageUpdate", this.client.listeners("messageCreate")[0]);
        
        //this.client.on('guildCreate', () => {
        //      this.client.editStatus('online', {name: `Tracking ${this.client.guilds.size} servers`});
        //});
        
        this.client.on('messageCreate', message => {
            if (!message.channel.guild || !message.channel.guild.id) {
                return;
            }
            
            this.track("message_receive", message.channel.guild.id, message.author.id, {
                cd1: message.channel.guild.id,
                cd2: message.channel.id,
                cd3: message.author.id
            });
            let event = new MessageReceiveEvent({
                guild:   message.channel.guild.id,
                user:    message.author.id,
                message: message.id,
                channel: message.channel.id
            });
            
            event.save().catch(console.error);
        });
        this.client.on('guildMemberAdd', (guild, member) => {
            this.track("user_joined", guild.id, member.id);
        });
        this.client.on('guildMemberRemove', (guild, member) => {
            this.track("user_left", guild.id, member.id);
        });
        this.client.on('guildBanAdd', (guild, member) => {
            this.track("user_banned", guild.id, member.id);
        });
        
        return;
        
        this.client.on('voiceChannelJoin', ReadyHandler.startVoiceEvent.bind(this));
        this.client.on('voiceChannelJoin', (member, channel) => this.track("voice_join", member.guild.id, member.id));
        
        this.client.on('voiceChannelLeave', ReadyHandler.stopVoiceEvent.bind(this));
        this.client.on('voiceChannelSwitch', (member, oldChan, newChan) => {
            this.track("voice_switch", member.guild.id, member.id);
            this.track("voice_leave", member.guild.id, member.id);
            ReadyHandler.stopVoiceEvent(member, oldChan);
            ReadyHandler.startVoiceEvent(member, newChan);
            this.track("voice_join", member.guild.id, member.id);
        });
        
        this.client.on('voiceStateUpdate', (member, oldState) => {
            if (member.voiceState.deaf || member.voiceState.selfDeaf) {
                ReadyHandler.stopVoiceEvent(member, member.guild.channels.get(member.voiceState.channelID));
                return;
            }
            
            ReadyHandler.startVoiceEvent(member, member.guild.channels.get(member.voiceState.channelID));
        });
        
        this.checkVoiceChannelStates();
    }
    
    static startVoiceEvent(member, channel, approximate = false) {
        // If this is the AFK channel, don't track.
        if (!channel || channel.id == member.guild.afkChannelID) {
            return;
        }
        
        // If user is deafened, don't track.
        if (member.voiceState && (member.voiceState.deaf || member.voiceState.selfDeaf)) {
            return;
        }
        
        let event = new VoiceEvent({
            guild:       member.guild.id,
            user:        member.id,
            channel:     channel.id,
            approximate: approximate
        });
        
        event.save().then(doc => {
            voiceEvents.push(doc);
        }).catch(console.error)
    }
    
    static async stopVoiceEvent(member, channel, approximate = false) {
        // If this is the AFK channel, don't track.
        if (!member.guild || channel.id == member.guild.afkChannelID) {
            return;
        }
        
        let doc, index = voiceEvents.findIndex(d => {
            return d.guild.toString() == member.guild.id
                && d.user.toString() == member.id
                && d.channel.toString() == channel.id
        });
        if (index >= 0) {
            doc = voiceEvents.splice(index, 1)[0];
        } else {
            doc = await VoiceEvent.findOne({
                guild:   member.guild.id,
                user:    member.id,
                channel: channel.id,
                hasLeft: false
            });
            
            if (!doc || doc.length === 0) {
                //console.log("No start event!");
                return;
            }
        }
        
        try {
            doc.update({
                hasLeft:       true,
                leftTimestamp: Date.now(),
                duration:      Date.now() - doc.timestamp,
                approximate:   approximate
            }).catch(console.error);
        } catch (e) {
            console.error(e);
        }
    }
}
