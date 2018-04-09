/*
Byzantine scenarios for validator to attack network. 
me.consensus=require('src/byzantine')


*/

module.exports = async () => {
  var second = ts() % K.blocktime

  var phase;

  if (second < 5) {
    phase = 'propose'
  } else if (second < 10) {
    phase = 'prevote'
  } else if (second < 15) {
    phase = 'precommit'
  } else if (second < 25) {
    phase = 'await'
  }


  var gossip_delay = 2000 // anti clock skew
  
  if (me.status == 'await' && phase == 'propose') {
      me.status = 'propose'

      if (me.my_member == me.next_member()) {


        l(`it's our turn to propose, gossip new block`)

        if (me.proposed_block.locked) {
          // We precommited to previous block, keep proposing it
          var {header, ordered_tx_body} = me.proposed_block

        }

        // processing mempool
        var ordered_tx = []
        var total_size = 0

        var meta = {dry_run: true}

        for (var candidate of me.mempool) {
          if (total_size + candidate.length > K.blocksize) break

          var result = await Tx.processTx(candidate, meta)
          if (result.success) {
            ordered_tx.push(candidate)
            total_size += candidate.length
          } else {
            l(result.error)
            // punish submitter ip
          }
        }

        // sort by fee

        // flush it
        me.mempool = []

        var ordered_tx_body = r(ordered_tx)

        var header = r([
          methodMap('propose'),
          me.record.id,
          Buffer.from(K.prev_hash, 'hex'),
          ts(),
          sha3(ordered_tx_body)
        ])

        var propose = r([
          bin(me.block_keypair.publicKey),
          bin(ec(header, me.block_keypair.secretKey)),
          header,
          ordered_tx_body
        ])

        setTimeout(()=>{
          me.gossip('propose', propose) 
        }, gossip_delay)

      }



  } else if (me.status == 'propose' && phase == 'prevote') {
    me.status = 'prevote'

    // gossip your prevotes for block or nil
    var prevotable = me.proposed_block ? me.proposed_block.header : 0 
  
    setTimeout(()=>{
      me.gossip('prevote', me.block_envelope(methodMap('prevote'), prevotable))
    }, gossip_delay)
  } else if (me.status == 'prevote' && phase == 'precommit') {
    me.status = 'precommit'

    // gossip your precommits if have 2/3+ prevotes or nil

    // do we have enough prevotes?
    var shares = 0
    Members.map((c, index) => {
      if (c.prevote) {
        shares += c.shares
      }
    })

    l("Prevotes "+shares)

    if (shares >= K.majority) {
      var precommitable = me.proposed_block.header

      // lock on this block. Unlock only if another block gets 2/3+
      me.proposed_block.locked = true

    } else {
      var precommitable = 0

    }

    setTimeout(()=>{
      me.gossip('precommit', me.block_envelope(methodMap('precommit'), precommitable))
    }, gossip_delay)

  } else if (me.status == 'precommit' && phase == 'await') {
    me.status = 'await'

    // if have 2/3+ precommits, commit the block and share
    var shares = 0

    var precommits = []
    Members.map((c, index) => {
      if (c.precommit) {
        shares += c.shares
        precommits[index] = c.precommit
      } else {
        precommits[index] = 0
      }

      // flush sigs for next round
      c.prevote = null
      c.precommit = null
    })

    if (shares < K.majority) {
      if (!me.proposed_block.locked) me.proposed_block = {}

      l(`Failed to commit, only ${shares} precommits / ${K.majority}`)
    } else {
      l("Success! commit block")

      var block = r([precommits,
          me.proposed_block.header,
          me.proposed_block.ordered_tx_body
        ])

      me.proposed_block = {}

      await me.processBlock(block)
      fs.writeFileSync('data/k.json', stringify(K))

    }
  }




  setTimeout(me.consensus, 1000) // watch for new events in 1 s
}