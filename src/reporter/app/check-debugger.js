var Node = require('basis.ui').Node;

var timer;
var view = new Node({
  show: new basis.Token(false),
  template: resource('./template/debugger-open.tmpl'),
  binding: {
    show: 'show'
  }
});

basis.doc.body.ready(function(body){
  body.appendChild(view.element);
});

module.exports = function(){
  if (timer)
    timer = clearTimeout(timer);

  var time = Date.now();
  view.show.set(false);
  timer = setTimeout(function(){
    if (Date.now() - time < 200)
    {
      view.show.set(true);
      timer = setTimeout(function(){
        view.show.set(false);
      }, 3000);
    }
  }, 100);
};
