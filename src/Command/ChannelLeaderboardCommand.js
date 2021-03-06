import moment from "moment";
import MessageReceiveAggregate from "../Model/MessageReceiveAggregate";

module.exports = class ChannelLeaderboardCommand {
    static get name() {
        return 'channel-leaderboard';
    }
    
    static get config() {
        return {
            guildOnly:       true,
            description:     "View the top 25 posters in this channel!",
            fullDescription: "View the top 25 posters in this channel!"
        }
    }
    
    static run(msg, args) {
        return ChannelLeaderboardCommand.getTextLeaderboard.call(this, msg);
    }
    
    static async getTextLeaderboard(msg) {
        const guildId = msg.channel.guild.id,
              start   = new Date();
        
        let results;
        try {
            results = await MessageReceiveAggregate.aggregate([
                {
                    $match: {
                        guild:   guildId.toLong(),
                        channel: msg.channel.id.toLong(),
                        year:    start.getFullYear(),
                        month:   start.getMonth() + 1
                    }
                },
                {$group: {_id: "$user", messages: {$sum: "$count"}}},
                {$sort: {messages: -1}}
            ]);
        } catch (e) {
            this.embedError(msg.channel, e);
            return;
        }
        
        const users = results.map(x => {
            const user = this.client.users.get(x._id.toString());
            if (!user || user.bot || this.getConfig(guildId).ignoredUsers.indexOf(user.id) >= 0) {
                return;
            }
            
            return {user: user, messages: x.messages};
        }).filter(x => !!x);
        
        if (users.length === 0) {
            msg.channel.createMessage("No stats for this channel. Try again later.");
            return;
        }
        
        msg.channel.createMessage({
            embed: {
                author:    {
                    name: "Current Leaderboard for " + msg.channel.name
                },
                footer:    {
                    text: "Data is slightly delayed | " + moment.duration((new Date()) - start).milliseconds() + 'ms'
                },
                type:      "rich",
                title:     "Leaderboard for the last: 30 Days",
                timestamp: moment().utc(),
                color:     0x00FF00,
                fields:    users.slice(0, 25).map((x, index) => {
                    return {
                        inline: true,
                        name:   index + 1 + ") " + x.user.username,
                        value:  x.messages + ' messages'
                    }
                })
            }
        }).catch(e => this.embedError(msg.channel, e));
    }
};
