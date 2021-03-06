module.exports = async (ws, args) => {
  let [pubkey, sig, body] = args

  if (ec.verify(r([methodMap('auth')]), sig, pubkey)) {
    //if (pubkey.equals(me.pubkey)) return false

    // wrap in custom WebSocketClient if it is a raw ws object
    if (ws.instance) {
      me.sockets[pubkey] = ws
    } else {
      me.sockets[pubkey] = new WebSocketClient()
      me.sockets[pubkey].instance = ws
    }

    if (trace) l('New peer: ', pubkey)
  } else {
    l('Invalid auth attempt')
    return false
  }
}
