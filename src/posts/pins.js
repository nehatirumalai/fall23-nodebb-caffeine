'use strict';

const db = require('../database');
const plugins = require('../plugins');

module.exports = function (Posts) {
    Posts.pin = async function (pid, uid) {
        return await togglePin('pin', pid, uid);
    };

    Posts.unpin = async function (pid, uid) {
        return await togglePin('unpin', pid, uid);
    };

    async function togglePin(type, pid, uid) {
        if (parseInt(uid, 10) <= 0) {
            throw new Error('[[error:not-logged-in]]');
        }

        const isPinning = type === 'pin';

        const [postData, hasPinned] = await Promise.all([
            Posts.getPostFields(pid, ['pid', 'uid']),
            Posts.hasPinned(pid, uid),
        ]);

        if (isPinning && hasPinned) {
            throw new Error('[[error:already-bookmarked]]');
        }

        if (!isPinning && !hasPinned) {
            throw new Error('[[error:already-unbookmarked]]');
        }

        if (isPinning) {
            await db.sortedSetAdd(`uid:${uid}:bookmarks`, Date.now(), pid);
        } else {
            await db.sortedSetRemove(`uid:${uid}:bookmarks`, pid);
        }
        await db[isPinning ? 'setAdd' : 'setRemove'](`pid:${pid}:users_bookmarked`, uid);
        postData.pins = await db.setCount(`pid:${pid}:users_bookmarked`);
        await Posts.setPostField(pid, 'bookmarks', postData.bookmarks);

        plugins.hooks.fire(`action:post.${type}`, {
            pid: pid,
            uid: uid,
            owner: postData.uid,
            current: hasBookmarked ? 'bookmarked' : 'unbookmarked',
        });

        return {
            post: postData,
            isPinned: isPinning,
        };
    }

    Posts.hasPinned = async function (pid, uid) {
        if (parseInt(uid, 10) <= 0) {
            return Array.isArray(pid) ? pid.map(() => false) : false;
        }

        if (Array.isArray(pid)) {
            const sets = pid.map(pid => `pid:${pid}:users_bookmarked`);
            return await db.isMemberOfSets(sets, uid);
        }
        return await db.isSetMember(`pid:${pid}:users_bookmarked`, uid);
    };
};
