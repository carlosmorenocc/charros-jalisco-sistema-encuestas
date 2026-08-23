import { createHash } from 'node:crypto';

export function buildMergeCandidates(contacts, maximumGroupSize = 25, onOversizedGroup = () => {}) {
  const pairEvidence = new Map();
  const indexes = {
    email: groupBy(contacts, (contact) => contact.emailNormalized, isUsableExactKey),
    phone: groupBy(contacts, (contact) => contact.phoneNormalized, isUsableExactKey),
    name: groupBy(contacts, (contact) => contact.nameNormalized, isUsableNameKey)
  };

  for (const [kind, index] of Object.entries(indexes)) {
    for (const [key, groupedContacts] of index.entries()) {
      if (groupedContacts.length < 2) continue;
      if (groupedContacts.length > maximumGroupSize) {
        onOversizedGroup(`IDENTITY_${kind.toLocaleUpperCase('en-US')}_GROUP_TOO_LARGE`);
        continue;
      }
      for (let leftIndex = 0; leftIndex < groupedContacts.length - 1; leftIndex += 1) {
        for (let rightIndex = leftIndex + 1; rightIndex < groupedContacts.length; rightIndex += 1) {
          const left = groupedContacts[leftIndex];
          const right = groupedContacts[rightIndex];
          if (left.id === right.id) continue;
          const pairKey = stablePairKey(left.id, right.id);
          const evidence = pairEvidence.get(pairKey) ?? {
            leftContactId: left.id < right.id ? left.id : right.id,
            rightContactId: left.id < right.id ? right.id : left.id,
            leftSourceRecordId: left.id < right.id ? left.sourceRecordId : right.sourceRecordId,
            rightSourceRecordId: left.id < right.id ? right.sourceRecordId : left.sourceRecordId,
            rules: new Set()
          };
          evidence.rules.add(`EXACT_${kind.toLocaleUpperCase('en-US')}`);
          pairEvidence.set(pairKey, evidence);
        }
      }
      void key;
    }
  }

  return [...pairEvidence.values()]
    .map((evidence) => {
      const rules = [...evidence.rules].sort();
      const hasEmail = evidence.rules.has('EXACT_EMAIL');
      const hasPhone = evidence.rules.has('EXACT_PHONE');
      const confidence = hasEmail && hasPhone
        ? 'high'
        : hasEmail || hasPhone
          ? 'medium'
          : 'low';
      return {
        id: deterministicId('merge-candidate', evidence.leftContactId, evidence.rightContactId),
        leftContactId: evidence.leftContactId,
        rightContactId: evidence.rightContactId,
        leftSourceRecordId: evidence.leftSourceRecordId,
        rightSourceRecordId: evidence.rightSourceRecordId,
        confidence,
        ruleCodes: rules,
        reviewStatus: 'pending_review'
      };
    })
    .sort((left, right) => left.id.localeCompare(right.id));
}

export function deterministicId(...parts) {
  const hex = createHash('sha256')
    .update(parts.map((part) => String(part ?? '')).join('\u0000'))
    .digest('hex')
    .slice(0, 32);
  // UUID determinista, variante RFC 4122 y versión 5 semántica, sin exponer PII.
  const versioned = `${hex.slice(0, 12)}5${hex.slice(13, 16)}a${hex.slice(17)}`;
  return [
    versioned.slice(0, 8),
    versioned.slice(8, 12),
    versioned.slice(12, 16),
    versioned.slice(16, 20),
    versioned.slice(20, 32)
  ].join('-');
}

function groupBy(records, selector, predicate) {
  const groups = new Map();
  for (const record of records) {
    const key = selector(record);
    if (!predicate(key)) continue;
    const group = groups.get(key) ?? [];
    group.push(record);
    groups.set(key, group);
  }
  return groups;
}

function stablePairKey(left, right) {
  return left < right ? `${left}:${right}` : `${right}:${left}`;
}

function isUsableExactKey(value) {
  return typeof value === 'string' && value.length >= 6;
}

function isUsableNameKey(value) {
  if (typeof value !== 'string' || value.length < 6) return false;
  return value.split(' ').filter(Boolean).length >= 2;
}
