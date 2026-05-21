import {$callback} from '@api/$callback';
import {$kv} from '@api/$kv';
import {$message} from '@api/$message';
import {$room} from '@api/$room';
import {$user} from '@api/$user';
import {djb2Hash} from './data_processing';
import {TemplateEngine} from './template_engine';

export type ColorGroup = 'red' | 'green' | 'darkblue' | 'lightpurple' | 'darkpurple' | 'lightblue';

export type NoticeTarget =
  | { kind: 'all' }
  | { kind: 'username'; username: string }
  | { kind: 'colorGroup'; colorGroup: ColorGroup };

export interface NoticeOptionsLike {
  toUsername?: string;
  color?: string;
  bgColor?: string;
  fontWeight?: 'normal' | 'bold' | 'bolder';
  toColorGroup?: ColorGroup;
}

export interface SmartNoticeEnvelope {
  noticeId: string;
  category: string;
  message: string;
  messageHash: string;
  originalOptions?: NoticeOptionsLike;
  baseOptions?: NoticeOptionsLike;
  target: NoticeTarget;
  priority: number;
  createdAt: number;
  ttlSec?: number;
  estimatedRows: number;
}

export interface QueuedNotice {
  envelope: SmartNoticeEnvelope;
  queuedAt: number;
}

export type CampaignStatus = 'active' | 'completed' | 'cancelled' | 'expired';

export interface ActiveNoticeCampaign {
  campaignId: string;
  envelope: SmartNoticeEnvelope;
  status: CampaignStatus;
  activatedAt: number;
  activatedAtSeq: number;
  activatedAtRowCursor: number;
  targetSlotMask: number;
  processedSlotMask: number;
  expiresAt?: number;
  supersededByCampaignId?: string;
}

export interface ExposureLedgerItem {
  seq: number;
  rowStart: number;
  rowEnd: number;
  rows: number;
  type: 'user_message' | 'notice';
  username?: string;
  category?: string;
  messageHash?: string;
  campaignId?: string;
  createdAt: number;
}

export interface CategoryUserState {
  lastNoticeSeq?: number;
  lastNoticeHash?: string;
  lastNoticeAt?: number;
}

export interface SmartNoticeUserState {
  username: string;
  slot: number;
  joinedAtSeq: number;
  joinedAtRowCursor: number;
  visibleRows: number;
  charsPerRow: number;
  colorGroup?: ColorGroup;
  lastSeenAt: number;
  categoryState: Record<string, CategoryUserState>;
  deliveredCampaigns?: Record<string, number>;
}

export interface SmartNoticeState {
  version: number;
  seq: number;
  rowCursor: number;
  currentSlot: number;
  pendingByCategory: Record<string, QueuedNotice[]>;
  activeByCategory: Record<string, ActiveNoticeCampaign | null>;
  ledger: Record<string, ExposureLedgerItem>;
  lastGlobalNoticeAt?: number;
}

export type PendingOverflowPolicy = 'ignore_new' | 'drop_oldest' | 'replace_all' | 'replace_lower_priority';
export type ActiveConflictPolicy = 'wait' | 'cancel_active_if_higher_priority';

export interface CategoryPolicy {
  maxPending: number;
  activeConflict: ActiveConflictPolicy;
  pendingOverflow: PendingOverflowPolicy;
  categoryCooldownSec?: number;
}

export interface NoticeMeta {
  channel?: string;
  category?: string;
  priority?: number;
  noticeId?: string;
  ttlSec?: number;
  params?: object | any[];
}

export interface SendNoticeMeta extends NoticeMeta {
  affectCooldown?: boolean;
}

export interface SmartNoticeTimerConfig {
  namespace?: string;
  slotCount?: number;
  defaultVisibleRows?: number;
  defaultCharsPerRow?: number;
  maxLedgerSize?: number;
  globalCooldownSec?: number;
  maxDeliveredCampaigns?: number;
  callbackLabel?: string;
  callbackDelaySec?: number;
  categoryPolicies?: Record<string, CategoryPolicy>;
}

export const USER_ROLE_TO_COLOR_GROUP: Record<string, ColorGroup> = {
  o: 'lightpurple',
  m: 'lightblue',
  f: 'red',
  l: 'lightblue',
  p: 'darkblue',
  tr: 'green',
  t: 'darkpurple',
  g: 'lightblue',
};

const DEFAULT_CATEGORY_POLICIES: Record<string, CategoryPolicy> = {
  menu: { maxPending: 1, activeConflict: 'wait', pendingOverflow: 'replace_all' },
  rules: { maxPending: 1, activeConflict: 'wait', pendingOverflow: 'replace_all' },
  commands: { maxPending: 1, activeConflict: 'wait', pendingOverflow: 'replace_all' },
  socials: { maxPending: 1, activeConflict: 'wait', pendingOverflow: 'replace_all' },
  goal: { maxPending: 2, activeConflict: 'cancel_active_if_higher_priority', pendingOverflow: 'drop_oldest' },
  system: { maxPending: 1, activeConflict: 'cancel_active_if_higher_priority', pendingOverflow: 'replace_lower_priority' },
  custom: { maxPending: 1, activeConflict: 'wait', pendingOverflow: 'replace_all' },
};

export const ALL_SLOTS_MASK = (1 << 10) - 1;

export function slotBit(slot: number): number {
  return 1 << slot;
}

export function hasProcessedSlot(campaign: ActiveNoticeCampaign, slot: number): boolean {
  return (campaign.processedSlotMask & slotBit(slot)) !== 0;
}

export function markProcessedSlot(campaign: ActiveNoticeCampaign, slot: number): number {
  return campaign.processedSlotMask | slotBit(slot);
}

export function isCampaignComplete(campaign: ActiveNoticeCampaign): boolean {
  return campaign.processedSlotMask === campaign.targetSlotMask;
}

export function estimateRows(message: string, charsPerRow: number): number {
  if (!charsPerRow || charsPerRow <= 0 || !Number.isFinite(charsPerRow)) {
    charsPerRow = 45;
  }
  const emoticonRegex = /:\w+:/g;
  const emoticonMatches = message.match(emoticonRegex);
  const emoticonCount = emoticonMatches ? emoticonMatches.length : 0;
  const textOnly = message.replace(emoticonRegex, '');
  const textRows = Math.ceil(textOnly.length / charsPerRow);
  const emoticonRows = emoticonCount * 3;
  return Math.max(1, textRows + emoticonRows);
}

export function matchesTarget(envelope: SmartNoticeEnvelope, userState: SmartNoticeUserState): boolean {
  switch (envelope.target.kind) {
    case 'all':
      return true;
    case 'username':
      return envelope.target.username === userState.username;
    case 'colorGroup':
      return envelope.target.colorGroup === userState.colorGroup;
  }
}

export function isLedgerItemVisibleForUser(
  item: ExposureLedgerItem,
  userState: SmartNoticeUserState,
  state: SmartNoticeState,
): boolean {
  if (item.seq < userState.joinedAtSeq) return false;
  const visibleStart = state.rowCursor - userState.visibleRows;
  return item.rowStart < state.rowCursor && item.rowEnd > visibleStart;
}

export function sameCategoryHashIsVisible(
  userState: SmartNoticeUserState,
  campaign: ActiveNoticeCampaign,
  state: SmartNoticeState,
): boolean {
  const catState = userState.categoryState[campaign.envelope.category];
  if (!catState || catState.lastNoticeSeq === undefined || !catState.lastNoticeHash) return false;
  if (catState.lastNoticeHash !== campaign.envelope.messageHash) return false;

  const item = state.ledger[String(catState.lastNoticeSeq)];
  if (!item) return false;
  if (item.category !== campaign.envelope.category) return false;
  if (item.messageHash !== campaign.envelope.messageHash) return false;

  return isLedgerItemVisibleForUser(item, userState, state);
}

export function normalizeEnvelope(
  message: string,
  options?: NoticeOptionsLike,
  meta?: NoticeMeta,
  defaultCharsPerRow?: number,
): SmartNoticeEnvelope {
  let renderedMessage = message;
  if (meta?.params) {
    renderedMessage = TemplateEngine.render(message, meta.params);
  }

  let target: NoticeTarget = { kind: 'all' };
  const baseOptions: NoticeOptionsLike = {};

  if (options) {
    if (options.toUsername) {
      target = { kind: 'username', username: options.toUsername };
    } else if (options.toColorGroup) {
      target = { kind: 'colorGroup', colorGroup: options.toColorGroup };
    }

    if (options.color) baseOptions.color = options.color;
    if (options.bgColor) baseOptions.bgColor = options.bgColor;
    if (options.fontWeight) baseOptions.fontWeight = options.fontWeight;
  }

  const category = meta?.channel ?? meta?.category ?? 'custom';
  const hashInput = category + renderedMessage;
  const messageHash = djb2Hash(hashInput);

  const now = Date.now();

  return {
    noticeId: meta?.noticeId || `n_${now}_${Math.random().toString(36).slice(2, 8)}`,
    category,
    message: renderedMessage,
    messageHash,
    originalOptions: options ? { ...options } : undefined,
    baseOptions,
    target,
    priority: meta?.priority ?? 0,
    createdAt: now,
    ttlSec: meta?.ttlSec,
    estimatedRows: estimateRows(renderedMessage, defaultCharsPerRow ?? 45),
  };
}

function defaultState(): SmartNoticeState {
  return {
    version: 1,
    seq: 0,
    rowCursor: 0,
    currentSlot: 0,
    pendingByCategory: {},
    activeByCategory: {},
    ledger: {},
    lastGlobalNoticeAt: undefined,
  };
}

export class SmartNoticeTimer {
  private config: Required<SmartNoticeTimerConfig>;
  private state: SmartNoticeState;

  constructor(config?: SmartNoticeTimerConfig) {
    const mergedPolicies: Record<string, CategoryPolicy> = {};
    for (const key of Object.keys(DEFAULT_CATEGORY_POLICIES)) {
      mergedPolicies[key] = { ...DEFAULT_CATEGORY_POLICIES[key] };
    }
    if (config?.categoryPolicies) {
      for (const key of Object.keys(config.categoryPolicies)) {
        mergedPolicies[key] = { ...mergedPolicies[key], ...config.categoryPolicies[key] };
      }
    }

    const slotCount = config?.slotCount ?? 10;
    if (!Number.isInteger(slotCount) || slotCount < 1 || slotCount > 30) {
      throw new Error(`SmartNoticeTimer: slotCount must be an integer between 1 and 30, got ${slotCount}`);
    }

    const callbackDelaySec = config?.callbackDelaySec ?? 1;
    if (typeof callbackDelaySec !== 'number' || !Number.isFinite(callbackDelaySec) || callbackDelaySec < 1) {
      throw new Error(`SmartNoticeTimer: callbackDelaySec must be a finite number >= 1, got ${callbackDelaySec}`);
    }

    const namespace = config?.namespace ?? 'snt';

    this.config = {
      namespace,
      slotCount,
      defaultVisibleRows: config?.defaultVisibleRows ?? 10,
      defaultCharsPerRow: config?.defaultCharsPerRow ?? 45,
      maxLedgerSize: config?.maxLedgerSize ?? 200,
      globalCooldownSec: config?.globalCooldownSec ?? 0,
      maxDeliveredCampaigns: config?.maxDeliveredCampaigns ?? 100,
      callbackLabel: config?.callbackLabel || `${namespace}:smart_notice_tick`,
      callbackDelaySec,
      categoryPolicies: mergedPolicies,
    };

    this.state = this.loadState();
  }

  private kvKey(key: string): string {
    return this.config.namespace + ':' + key;
  }

  private loadState(): SmartNoticeState {
    const raw = $kv.get(this.kvKey('state'));
    if (raw === undefined) return defaultState();
    try {
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      return { ...defaultState(), ...parsed };
    } catch {
      return defaultState();
    }
  }

  private saveState(): void {
    $kv.set(this.kvKey('state'), JSON.stringify(this.state));
  }

  private loadUserState(username: string): SmartNoticeUserState | undefined {
    const raw = $kv.get(this.kvKey('user:' + username));
    if (raw === undefined) return undefined;
    try {
      return typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch {
      return undefined;
    }
  }

  private pruneDeliveredCampaigns(userState: SmartNoticeUserState): void {
    const dc = userState.deliveredCampaigns;
    if (!dc) return;
    const keys = Object.keys(dc);
    if (keys.length <= this.config.maxDeliveredCampaigns) return;

    const entries = keys
      .map(k => ({ key: k, value: (dc as Record<string, any>)[k] }))
      .filter((e): e is { key: string; value: number } => typeof e.value === 'number')
      .sort((a, b) => b.value - a.value);

    const pruned: Record<string, number> = {};
    for (let i = 0; i < Math.min(this.config.maxDeliveredCampaigns, entries.length); i++) {
      pruned[entries[i].key] = entries[i].value;
    }
    userState.deliveredCampaigns = pruned;
  }

  private saveUserState(userState: SmartNoticeUserState): void {
    this.pruneDeliveredCampaigns(userState);
    $kv.set(this.kvKey('user:' + userState.username), JSON.stringify(userState));
  }

  private removeUserState(username: string): void {
    $kv.remove(this.kvKey('user:' + username));
  }

  private getCategoryPolicy(category: string): CategoryPolicy {
    return this.config.categoryPolicies[category]
      || this.config.categoryPolicies['custom']
      || DEFAULT_CATEGORY_POLICIES['custom'];
  }

  configureChannel(channel: string, policy: CategoryPolicy): void {
    this.config.categoryPolicies[channel] = { ...this.config.categoryPolicies[channel], ...policy };
  }

  configureChannels(policies: Record<string, CategoryPolicy>): void {
    for (const [channel, policy] of Object.entries(policies)) {
      this.configureChannel(channel, policy);
    }
  }

  private handlePendingOverflow(queue: QueuedNotice[], policy: CategoryPolicy): 'kept' | 'dropped_new' {
    if (queue.length <= policy.maxPending) return 'kept';

    switch (policy.pendingOverflow) {
      case 'ignore_new':
        queue.pop();
        return 'dropped_new';
      case 'drop_oldest':
        queue.shift();
        return 'kept';
      case 'replace_all':
        queue.splice(0, queue.length - 1);
        return 'kept';
      case 'replace_lower_priority':
        queue.sort((a, b) => b.envelope.priority - a.envelope.priority);
        queue.splice(policy.maxPending);
        return 'kept';
    }
  }

  private activatePendingNotices(): void {
    for (const [category, queue] of Object.entries(this.state.pendingByCategory)) {
      const active = this.state.activeByCategory[category];
      if (active && active.status === 'active') continue;
      if (!queue || queue.length === 0) continue;

      const queued = queue.shift()!;
      const slotMask = (1 << this.config.slotCount) - 1;

      const campaign: ActiveNoticeCampaign = {
        campaignId: queued.envelope.noticeId || `camp_${this.state.seq}_${category}`,
        envelope: queued.envelope,
        status: 'active',
        activatedAt: Date.now(),
        activatedAtSeq: this.state.seq,
        activatedAtRowCursor: this.state.rowCursor,
        targetSlotMask: slotMask,
        processedSlotMask: 0,
        expiresAt: queued.envelope.ttlSec !== undefined ? Date.now() + queued.envelope.ttlSec * 1000 : undefined,
      };

      this.state.activeByCategory[category] = campaign;
    }
  }

  private pruneLedger(): void {
    const keys = Object.keys(this.state.ledger).map(Number).sort((a, b) => a - b);
    if (keys.length <= this.config.maxLedgerSize) return;
    const toDelete = keys.slice(0, keys.length - this.config.maxLedgerSize);
    for (const key of toDelete) {
      delete this.state.ledger[String(key)];
    }
  }

  private sendToUser(userState: SmartNoticeUserState, campaign: ActiveNoticeCampaign, now: number): void {
    const sendOptions: NoticeOptionsLike = { ...campaign.envelope.baseOptions };
    sendOptions.toUsername = userState.username;
    $room.sendNotice(campaign.envelope.message, sendOptions);

    const seq = this.state.seq;
    const rowStart = this.state.rowCursor;
    const rows = campaign.envelope.estimatedRows;

    this.state.ledger[String(seq)] = {
      seq,
      rowStart,
      rowEnd: rowStart + rows,
      rows,
      type: 'notice',
      category: campaign.envelope.category,
      messageHash: campaign.envelope.messageHash,
      campaignId: campaign.campaignId,
      createdAt: now,
    };
    this.state.seq++;
    this.state.rowCursor += rows;
    this.state.lastGlobalNoticeAt = now;

    if (!userState.deliveredCampaigns) userState.deliveredCampaigns = {};
    userState.deliveredCampaigns[campaign.campaignId] = now;

    if (!userState.categoryState[campaign.envelope.category]) {
      userState.categoryState[campaign.envelope.category] = {};
    }
    userState.categoryState[campaign.envelope.category].lastNoticeSeq = seq;
    userState.categoryState[campaign.envelope.category].lastNoticeHash = campaign.envelope.messageHash;
    userState.categoryState[campaign.envelope.category].lastNoticeAt = now;
  }

  private isGlobalCooldownActive(): boolean {
    if (this.config.globalCooldownSec <= 0 || !this.state.lastGlobalNoticeAt) return false;
    return Date.now() - this.state.lastGlobalNoticeAt < this.config.globalCooldownSec * 1000;
  }

  private isCategoryCooldownActive(userState: SmartNoticeUserState, campaign: ActiveNoticeCampaign): boolean {
    const now = Date.now();
    const policy = this.getCategoryPolicy(campaign.envelope.category);
    if (policy.categoryCooldownSec && policy.categoryCooldownSec > 0) {
      const catState = userState.categoryState[campaign.envelope.category];
      if (catState && catState.lastNoticeAt) {
        if (now - catState.lastNoticeAt < policy.categoryCooldownSec * 1000) {
          return true;
        }
      }
    }

    return false;
  }

  enqueue(
    message: string,
    options?: NoticeOptionsLike,
    meta?: NoticeMeta,
  ): boolean {
    const envelope = normalizeEnvelope(message, options, meta, this.config.defaultCharsPerRow);
    const category = envelope.category;
    const policy = this.getCategoryPolicy(category);

    if (!this.state.pendingByCategory[category]) {
      this.state.pendingByCategory[category] = [];
    }
    const queue = this.state.pendingByCategory[category]!;

    const active = this.state.activeByCategory[category];
    if (active && active.status === 'active') {
      if (policy.activeConflict === 'cancel_active_if_higher_priority') {
        if (envelope.priority > active.envelope.priority) {
          active.status = 'cancelled';
          active.supersededByCampaignId = envelope.noticeId;
          delete this.state.activeByCategory[category];
        }
      }
    }

    queue.push({ envelope, queuedAt: Date.now() });
    const overflowResult = this.handlePendingOverflow(queue, policy);

    this.saveState();
    return overflowResult !== 'dropped_new';
  }

  dequeue(channel?: string): number {
    let removed = 0;
    if (channel) {
      const queue = this.state.pendingByCategory[channel];
      if (queue) {
        removed = queue.length;
        delete this.state.pendingByCategory[channel];
      }
    } else {
      for (const key of Object.keys(this.state.pendingByCategory)) {
        removed += this.state.pendingByCategory[key]!.length;
      }
      this.state.pendingByCategory = {};
    }
    this.saveState();
    return removed;
  }

  clearQueue(channel?: string): number {
    return this.dequeue(channel);
  }

  cancelActive(channel?: string): number {
    let removed = 0;
    if (channel) {
      const campaign = this.state.activeByCategory[channel];
      if (campaign) {
        campaign.status = 'cancelled';
        delete this.state.activeByCategory[channel];
        removed = 1;
      }
    } else {
      for (const [key, campaign] of Object.entries(this.state.activeByCategory)) {
        if (campaign) {
          campaign.status = 'cancelled';
          delete this.state.activeByCategory[key];
          removed++;
        }
      }
    }
    this.saveState();
    return removed;
  }

  sendNotice(message: string, options?: NoticeOptionsLike, meta?: SendNoticeMeta): void {
    const renderedMessage = meta?.params
      ? TemplateEngine.render(message, meta.params)
      : message;

    const sendOptions: NoticeOptionsLike = { ...options };
    $room.sendNotice(renderedMessage, sendOptions);

    const channel = meta?.channel ?? meta?.category ?? 'custom';
    const hashInput = channel + renderedMessage;
    const messageHash = djb2Hash(hashInput);
    const now = Date.now();
    const rows = estimateRows(renderedMessage, this.config.defaultCharsPerRow);

    this.state.ledger[String(this.state.seq)] = {
      seq: this.state.seq,
      rowStart: this.state.rowCursor,
      rowEnd: this.state.rowCursor + rows,
      rows,
      type: 'notice',
      category: channel,
      messageHash,
      createdAt: now,
    };
    this.state.seq++;
    this.state.rowCursor += rows;

    if (meta?.affectCooldown) {
      this.state.lastGlobalNoticeAt = now;
    }

    this.pruneLedger();
    this.saveState();
  }

  onUserMessage(user: { username: string; colorGroup?: string; [key: string]: any }, message: string): void {
    const userState = this.touchUser(user);
    if (!userState) return;

    const seq = this.state.seq;
    const rows = estimateRows(message, userState.charsPerRow);
    const rowStart = this.state.rowCursor;

    this.state.ledger[String(seq)] = {
      seq,
      rowStart,
      rowEnd: rowStart + rows,
      rows,
      type: 'user_message',
      username: userState.username,
      createdAt: Date.now(),
    };
    this.state.seq++;
    this.state.rowCursor += rows;

    this.pruneLedger();
    this.saveUserState(userState);
    this.saveState();
  }

  touchUser(user: { username: string; colorGroup?: string; [key: string]: any }): SmartNoticeUserState {
    const username = user.username;
    let userState = this.loadUserState(username);

    if (!userState) {
      const roleColor = user.colorGroup ? USER_ROLE_TO_COLOR_GROUP[user.colorGroup] : undefined;
      userState = {
        username,
        slot: this.state.currentSlot,
        joinedAtSeq: this.state.seq,
        joinedAtRowCursor: this.state.rowCursor,
        visibleRows: user.visibleLineCount ?? this.config.defaultVisibleRows,
        charsPerRow: user.charsPerRow ?? this.config.defaultCharsPerRow,
        colorGroup: roleColor as ColorGroup | undefined,
        lastSeenAt: Date.now(),
        categoryState: {},
      };
    } else {
      const roleColor = user.colorGroup ? USER_ROLE_TO_COLOR_GROUP[user.colorGroup] : undefined;
      userState.lastSeenAt = Date.now();
      if (roleColor && !userState.colorGroup) {
        userState.colorGroup = roleColor as ColorGroup | undefined;
      }
      if (user.visibleLineCount !== undefined) userState.visibleRows = user.visibleLineCount;
      if (user.charsPerRow !== undefined) userState.charsPerRow = user.charsPerRow;
    }

    this.saveUserState(userState);
    return userState;
  }

  processForUser(user: { username: string; colorGroup?: string; [key: string]: any }): void {
    const userState = this.touchUser(user);
    if (!userState) return;

    if (!this.isGlobalCooldownActive()) {
      this.activatePendingNotices();
    }

    const now = Date.now();

    for (const campaign of Object.values(this.state.activeByCategory)) {
      if (!campaign || campaign.status !== 'active') continue;
      if (campaign.expiresAt && now >= campaign.expiresAt) {
        campaign.status = 'expired';
        continue;
      }
      if (userState.joinedAtSeq > campaign.activatedAtSeq) continue;
      if (!matchesTarget(campaign.envelope, userState)) continue;
      if (userState.deliveredCampaigns?.[campaign.campaignId]) continue;
      if (sameCategoryHashIsVisible(userState, campaign, this.state)) continue;
      if (this.isCategoryCooldownActive(userState, campaign)) continue;

      this.sendToUser(userState, campaign, now);
    }

    for (const [category, campaign] of Object.entries(this.state.activeByCategory)) {
      if (campaign && campaign.status !== 'active') {
        delete this.state.activeByCategory[category];
      }
    }

    this.pruneLedger();
    this.saveUserState(userState);
    this.saveState();
  }

  tick(): void {
    const now = Date.now();
    const slot = this.state.currentSlot;

    if (this.isGlobalCooldownActive()) {
      this.state.currentSlot = (slot + 1) % this.config.slotCount;
      this.saveState();
      return;
    }

    for (const campaign of Object.values(this.state.activeByCategory)) {
      if (campaign && campaign.status === 'active' && campaign.expiresAt && now >= campaign.expiresAt) {
        campaign.status = 'expired';
      }
    }

    const rawUsers = $room.users;
    const users: ReadonlyArray<readonly [string, string, string]> = Array.isArray(rawUsers) ? rawUsers : [];

    for (const campaign of Object.values(this.state.activeByCategory)) {
      if (!campaign || campaign.status !== 'active') continue;
      if (hasProcessedSlot(campaign, slot)) continue;

      for (const entry of users) {
        if (!entry || entry.length < 1) continue;
        const username = entry[0];
        const userState = this.loadUserState(username);
        if (!userState) continue;
        if (userState.slot !== slot) continue;
        if (userState.joinedAtSeq > campaign.activatedAtSeq) continue;
        if (!matchesTarget(campaign.envelope, userState)) continue;
        if (userState.deliveredCampaigns?.[campaign.campaignId]) continue;
        if (sameCategoryHashIsVisible(userState, campaign, this.state)) continue;
        if (this.isCategoryCooldownActive(userState, campaign)) continue;

        this.sendToUser(userState, campaign, now);
        this.saveUserState(userState);
      }

      campaign.processedSlotMask = markProcessedSlot(campaign, slot);
    }

    for (const campaign of Object.values(this.state.activeByCategory)) {
      if (campaign && campaign.status === 'active' && isCampaignComplete(campaign)) {
        campaign.status = 'completed';
      }
    }

    for (const [category, campaign] of Object.entries(this.state.activeByCategory)) {
      if (campaign && campaign.status !== 'active') {
        delete this.state.activeByCategory[category];
      }
    }

    this.state.currentSlot = (slot + 1) % this.config.slotCount;

    this.activatePendingNotices();
    this.pruneLedger();
    this.saveState();
  }

  clear(): void {
    const it = $kv.iter(this.kvKey(''));
    while (it.next()) {
      it.delete();
    }
    this.state = defaultState();
  }

  onAppStart(): void {
    $callback.cancel(this.config.callbackLabel);
    $callback.create(this.config.callbackLabel, this.config.callbackDelaySec, true);
  }

  onCallback(): void {
    if ($callback.label !== this.config.callbackLabel) return;
    this.tick();
  }

  onUserEnter(): void {
    this.processForUser($user);
  }

  onUserLeave(): void {
    this.removeUserState($user.username);
  }

  onChatMessage(): void {
    this.onUserMessage($user, $message.body);
  }

  getState(): SmartNoticeState {
    return JSON.parse(JSON.stringify(this.state));
  }

  getUserState(username: string): SmartNoticeUserState | undefined {
    return this.loadUserState(username);
  }
}
