// The page behind a link from an email: it posts itself so the link is spent by a person on a phone, not by a mail
// scanner fetching every link it sees. The Continue button is there for anyone whose browser is slow or has scripts off.
(function () { var f = document.forms[0]; if (f) setTimeout(function () { f.submit(); }, 300); })();
