import {InputRewriter} from '@lib/input_rewriter';
import {$user} from '@api/$user';

import {publishExample} from '../command_system/publish_example';

const rewriter = new InputRewriter()
    .exact('/menu', '/notice Tip menu: Spin Wheel')
    .exact('/hi', `Welcome ${$user.username}!`)
    .prefix('/vip ', '/limitcam add ')
    .regex(/^\/say\s+(.+)$/, '/notice $1');

publishExample('__EXAMPLE_INPUT_REWRITER_01__', {
    menu: rewriter.rewrite('/menu'),
    greeting: rewriter.rewrite('/hi'),
    vip: rewriter.rewrite('/vip alice'),
    notice: rewriter.rewrite('/say Goal reached'),
    unchanged: rewriter.rewrite('normal chat message'),
});
