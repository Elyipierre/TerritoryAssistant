function byKey(items, getKey) {
  return items.reduce((acc, item) => {
    const key = getKey(item) || 'Unknown';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function topEntries(obj, limit = 5) {
  return Object.entries(obj)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([label, value]) => ({ label, value }));
}

export function buildNotificationAnalytics(notifications = [], events = []) {
  const total = notifications.length;
  const delivered = notifications.filter((item) => item.delivery_state === 'delivered').length;
  const opened = notifications.filter((item) => item.delivery_state === 'opened' || item.opened_at).length;
  const clicked = notifications.filter((item) => item.delivery_state === 'clicked' || item.clicked_at).length;
  const bounced = notifications.filter((item) => item.delivery_state === 'bounced' || item.status === 'failed').length;
  const dispatched = notifications.filter((item) => item.status === 'dispatched').length;
  const acknowledged = notifications.filter((item) => item.status === 'acknowledged').length;

  const providerCounts = topEntries(byKey(notifications, (item) => item.provider_label || item.provider || item.channel));
  const lifecycleCounts = topEntries(byKey(notifications, (item) => item.delivery_state || item.status || 'queued'));
  const channelCounts = topEntries(byKey(notifications, (item) => item.channel || 'unknown'));
  const failureCounts = topEntries(byKey(
    notifications.filter((item) => item.failure_reason),
    (item) => item.failure_reason
  ), 6);
  const routeDomainCounts = topEntries(byKey(
    notifications.filter((item) => item.route_target && String(item.route_target).includes('@')),
    (item) => String(item.route_target).split('@')[1]?.toLowerCase() || 'unknown'
  ), 6);
  const eventTypeCounts = topEntries(byKey(events, (item) => item.event_type || 'unknown'), 8);

  const deliveryLatencyHours = notifications
    .filter((item) => item.last_attempt_at && item.delivered_at)
    .map((item) => {
      const attempted = new Date(item.last_attempt_at).getTime();
      const deliveredAt = new Date(item.delivered_at).getTime();
      if (Number.isNaN(attempted) || Number.isNaN(deliveredAt) || deliveredAt < attempted) return null;
      return (deliveredAt - attempted) / 36e5;
    })
    .filter((value) => value != null);

  const avgDeliveryLatencyHours = deliveryLatencyHours.length
    ? deliveryLatencyHours.reduce((sum, value) => sum + value, 0) / deliveryLatencyHours.length
    : null;

  const openRate = dispatched ? opened / dispatched : 0;
  const deliveryRate = dispatched ? delivered / dispatched : 0;
  const failureRate = total ? bounced / total : 0;

  return {
    totals: {
      total,
      delivered,
      opened,
      clicked,
      bounced,
      dispatched,
      acknowledged,
      openRate,
      deliveryRate,
      failureRate,
      avgDeliveryLatencyHours
    },
    providerCounts,
    lifecycleCounts,
    channelCounts,
    failureCounts,
    routeDomainCounts,
    eventTypeCounts
  };
}
