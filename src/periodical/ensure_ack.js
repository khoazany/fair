// This method ensures all settled hashlocks were ack on time. If we don't get ack on time,
// the hashlock may expire and we lose the money,
// that's why we must go to blockchain asap to reveal the secret to hashlock
module.exports = async () => {
  //l('Checking who has not ack')
  if (PK.pending_batch) return l('Pending batch')

  var deltas = await Channel.findAll()

  for (let d of deltas) {
    await section(['use', d.they_pubkey], async () => {
      let ch = await Channel.get(d.they_pubkey)
      //cache.ch[key]
      if (!ch) {
        return
      }

      let missed_ack = ch.d.ack_requested_at
        ? new Date() - ch.d.ack_requested_at
        : 0

      if (
        // already disputed
        ch.d.status == 'disputed' ||
        // they still have some time
        missed_ack < K.dispute_if_no_ack
      ) {
        return
      }

      var to_reveal = []

      // TODO: Consider not disputing with people when no funds are at risk i.e. only dispute about unacked settles.
      refresh(ch)

      // not getting an ack on time is bad, but the worst is losing settled hashlock
      for (var inward of ch.payments) {
        // we have secret for inward payment but it's not acked
        if (
          inward.is_inward &&
          inward.outcome_type == 'outcomeSecret' &&
          inward.status != 'ack'
        ) {
          // ensure they will still be revealed when resolve() happens. Extend lifetime if needed
          var unlocked = await Hashlock.findOne({where: {hash: inward.hash}})
          if (
            !unlocked ||
            unlocked.delete_at <
              K.usable_blocks + K.dispute_delay_for_users + K.hashlock_exp // when we expect resolution of our dispute
          ) {
            to_reveal.push(inward.outcome)
          } else {
            l('Already unlocked in ', ch.d)
          }
        }
      }

      if (to_reveal.length > 0) {
        l(
          `No ack dispute with ${trim(ch.d.they_pubkey)} secrets ${
            to_reveal.length
          } missed ${missed_ack} with ${ch.d.ack_requested_at}`
        )

        me.batchAdd('revealSecrets', to_reveal)
        me.batchAdd('dispute', await startDispute(ch))
      }
    })
  }
}
